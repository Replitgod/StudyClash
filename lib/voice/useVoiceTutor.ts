"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import {
  INITIAL_CALL_STATE,
  MAX_RECONNECT_ATTEMPTS,
  canEnd,
  classifyMediaError,
  isLive,
  reconnectDelayMs,
  transition,
  type CallErrorKind,
  type CallEvent,
  type CallState,
} from "./sessionMachine";
import { createSession, recordAsked } from "./tutorState";
import { resolveToolCall } from "./tools";
import { planForEvent } from "./realtimeEvents";
import { INACTIVITY_TIMEOUT_MS } from "./budget";
import type {
  Concept,
  SessionOptions,
  SessionSummary,
  SourceType,
  TranscriptTurn,
  TutorSession,
} from "./types";

// The call, end to end.
//
// Everything that has to survive a rerender lives in a ref, and everything
// the UI needs to draw lives in state. That split is not stylistic: a
// RTCPeerConnection recreated by an unlucky dependency array is a second
// live microphone and a second voice talking over the first, which is the
// single worst failure this feature has. Nothing in here is ever constructed
// during render.
//
// The other rule that shapes this file is the generation token. Every async
// step -- fetching a session, awaiting an SDP answer, a reconnect timer --
// checks that the connection it belongs to is still the current one before
// touching state. Without it, a reconnect that lands after the student has
// hung up will happily reopen the microphone.

type MicPermission = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

export type VoiceTutorLatency = {
  /** ms from tapping start to a usable connection. */
  connectMs: number | null;
  /** ms from the student going quiet to the first sound back. */
  lastResponseMs: number | null;
  /** ms from the student cutting in to the tutor's audio actually stopping. */
  lastInterruptionMs: number | null;
};

export type UseVoiceTutorArgs = {
  sourceType: SourceType;
  sourceId: string | null;
  options: SessionOptions;
};

const SPEAKING_THRESHOLD = 0.02;

export function useVoiceTutor({ sourceType, sourceId, options }: UseVoiceTutorArgs) {
  const [state, dispatch] = useReducer(transition, INITIAL_CALL_STATE);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [tutorSession, setTutorSession] = useState<TutorSession>(() => createSession([]));
  const [title, setTitle] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [speaker, setSpeaker] = useState<"student" | "tutor" | null>(null);
  const [needsTapToHear, setNeedsTapToHear] = useState(false);
  const [everHeardYou, setEverHeardYou] = useState(false);
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  const [textOnly, setTextOnly] = useState(false);
  const [latency, setLatency] = useState<VoiceTutorLatency>({
    connectMs: null,
    lastResponseMs: null,
    lastInterruptionMs: null,
  });

  // --- realtime objects, never state ---
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // --- timers ---
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxCallRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- bookkeeping that must not go stale inside event handlers ---
  const generationRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const tutorSessionRef = useRef<TutorSession>(createSession([]));
  const turnsRef = useRef<TranscriptTurn[]>([]);
  const phaseRef = useRef<CallState["phase"]>("idle");
  const savedRef = useRef(false);
  const mutedRef = useRef(false);
  const maxCallMsRef = useRef(10 * 60 * 1000);
  const activeResponseRef = useRef<string | null>(null);
  const toolOutputsRef = useRef(0);
  const speechStoppedAtRef = useRef<number | null>(null);
  const interruptAtRef = useRef<number | null>(null);
  const connectStartedAtRef = useRef(0);
  const optionsRef = useRef(options);
  const endedByRef = useRef<"student" | "timeout" | "inactivity" | "error" | null>(null);

  // Mirrors of the values the realtime event handlers need to read.
  //
  // Those handlers are created once and live for the whole call, so reading
  // `state` inside them would read whatever it was when the connection was
  // opened -- the classic stale closure, and here it would mean barge-in
  // checking a phase from ten minutes ago. Synced in an effect rather than
  // during render, because a render can be thrown away and re-run under
  // concurrent rendering, and a ref written during a discarded render keeps
  // the value anyway.
  useEffect(() => {
    optionsRef.current = options;
    phaseRef.current = state.phase;
    mutedRef.current = state.muted;
  }, [options, state.phase, state.muted]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return false;
    try {
      channel.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Tear down every resource this call owns.
   *
   * Order matters. The microphone tracks are stopped first because that is
   * the one the student can see -- the browser's recording indicator staying
   * lit after a call is the difference between "ended" and "still
   * listening", and no amount of correct WebRTC cleanup makes up for it.
   *
   * `keepMicrophone` exists for the reconnect path, which throws the dead
   * peer connection away and builds a new one around the microphone the
   * student already granted. Releasing and re-acquiring it there would put a
   * permission prompt in the middle of a dropped call, and on some browsers
   * would fail outright without a fresh user gesture.
   */
  const teardown = useCallback((options: { keepMicrophone?: boolean } = {}) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    for (const ref of [tickRef, maxCallRef, idleRef, reconnectRef, connectTimeoutRef]) {
      if (ref.current) {
        clearTimeout(ref.current as ReturnType<typeof setTimeout>);
        clearInterval(ref.current as ReturnType<typeof setInterval>);
        ref.current = null;
      }
    }

    if (!options.keepMicrophone) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) {
      channel.onmessage = null;
      channel.onopen = null;
      channel.onclose = null;
      channel.onerror = null;
      try {
        channel.close();
      } catch {
        // A channel closed by the connection dropping throws here. Not a
        // failure -- it is already in the state we wanted.
      }
    }

    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      // A sender's track IS the microphone track -- the same object that was
      // added from streamRef. Stopping it here unconditionally killed the
      // microphone on reconnect: the new connection came up fine and the
      // student was inaudible, with nothing on screen to say why.
      if (!options.keepMicrophone) {
        pc.getSenders().forEach((sender) => sender.track?.stop());
      }
      try {
        pc.close();
      } catch {
        // Same: closing an already-failed connection is a no-op we can ignore.
      }
    }

    // The audio element keeps a reference to the remote stream, which keeps
    // the whole connection alive for the garbage collector.
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }

    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    activeResponseRef.current = null;
    toolOutputsRef.current = 0;
    setLevel(0);
    setSpeaker(null);
  }, []);

  /** Persist the call. Guarded so a double-fired effect cannot save twice. */
  const saveSession = useCallback(
    async (status: "completed" | "failed") => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || savedRef.current) return null;
      savedRef.current = true;

      const session = tutorSessionRef.current;
      const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;

      try {
        const response = await authFetch("/api/vyra/voice-session", {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            status,
            durationMs,
            concepts: session.concepts.map((c) => ({
              id: c.id,
              label: c.label,
              priorWeak: c.priorWeak,
            })),
            attempts: session.attempts,
            turns: turnsRef.current,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (data?.summary) {
          setSummary(data.summary as SessionSummary);
          return data.summary as SessionSummary;
        }
      } catch {
        // A failed save must not swallow the student's review. The local
        // session state is still intact, so fall through and summarise from
        // it below.
      }
      return null;
    },
    []
  );

  const finish = useCallback(
    async (reason: "student" | "timeout" | "inactivity" | "error") => {
      endedByRef.current = reason;
      dispatch({ type: "END" });
      teardown();

      const hadAnything = tutorSessionRef.current.attempts.length > 0 || turnsRef.current.length > 0;
      await saveSession(reason === "error" ? "failed" : "completed");

      dispatch({ type: "ENDED" });
      void trackEvent(
        reason === "student" ? "voice_session_completed" : "voice_session_abandoned",
        { reason, hadAnything }
      );
    },
    [saveSession, teardown]
  );

  /** Reset the hang-up-on-silence timer. Any sign of life counts. */
  const bumpIdle = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      void finish("inactivity");
    }, INACTIVITY_TIMEOUT_MS);
  }, [finish]);

  /** Drives the orb from the two live audio streams. */
  const startMeter = useCallback((mic: MediaStream | null, remote: MediaStream) => {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    // Respect the student's motion preference: the orb still changes size
    // between states, it just stops animating per audio frame.
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    // Created under an autoplay policy it can start suspended, which leaves
    // the orb frozen even while the call is fine.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});

    const analyse = (stream: MediaStream) => {
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      node.smoothingTimeConstant = 0.75;
      ctx.createMediaStreamSource(stream).connect(node);
      return node;
    };

    // Analysers are read-only taps. Neither is connected to the destination,
    // so nothing here is played back -- routing the mic to the speakers is
    // exactly how you build an echo.
    const micNode = mic ? analyse(mic) : null;
    const tutorNode = analyse(remote);
    const buffer = new Uint8Array(tutorNode.frequencyBinCount);

    const rms = (node: AnalyserNode) => {
      node.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buffer.length);
    };

    let lastPaint = 0;

    const tick = (now: number) => {
      // 20fps is plenty for a breathing circle and costs a fifth of the CPU
      // of a per-frame read, which matters on the phone this runs on.
      if (now - lastPaint > 50) {
        lastPaint = now;
        const micLevel =
          micNode && streamRef.current?.getAudioTracks()[0]?.enabled ? rms(micNode) : 0;
        const tutorLevel = rms(tutorNode);

        // The tutor wins ties: while she is talking the student's own voice
        // is usually still bleeding into the mic a little.
        const loudest = Math.max(micLevel, tutorLevel);
        setSpeaker(
          loudest < SPEAKING_THRESHOLD ? null : tutorLevel >= micLevel ? "tutor" : "student"
        );
        setLevel(reducedMotion ? (loudest < SPEAKING_THRESHOLD ? 0 : 0.5) : Math.min(1, loudest * 3.2));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const appendTurn = useCallback((turn: TranscriptTurn) => {
    // Deduplicated by id, because a reconnect can replay the tail of the
    // conversation and a transcript that says everything twice is worse than
    // no transcript.
    if (turnsRef.current.some((existing) => existing.id === turn.id)) return;
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
  }, []);

  const handleMessage = useCallback(
    (raw: MessageEvent, generation: number) => {
      if (generation !== generationRef.current) return;

      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.data);
      } catch {
        return;
      }

      const type = String(message.type || "");
      const now = Date.now();

      // The barge-in and no-double-response decisions, taken by the pure
      // planner in realtimeEvents.ts so they are reachable from a test. What
      // is left in this switch is the side effects: transcripts, metrics and
      // the tool round-trip.
      const plan = planForEvent({
        type,
        phase: phaseRef.current,
        pendingToolOutputs: toolOutputsRef.current,
      });

      if (plan.cancelResponse && activeResponseRef.current) {
        interruptAtRef.current = now;
        send({ type: "response.cancel" });
      }
      if (plan.clearAudioBuffer) {
        interruptAtRef.current = interruptAtRef.current ?? now;
        send({ type: "output_audio_buffer.clear" });
      }
      if (plan.createResponse) {
        toolOutputsRef.current = 0;
        send({ type: "response.create" });
      }
      if (plan.transition) {
        dispatch(plan.transition);
      }

      switch (type) {
        case "input_audio_buffer.speech_started": {
          setEverHeardYou(true);
          bumpIdle();
          break;
        }

        case "input_audio_buffer.speech_stopped":
          speechStoppedAtRef.current = now;
          break;

        case "output_audio_buffer.cleared":
          if (interruptAtRef.current) {
            const took = now - interruptAtRef.current;
            interruptAtRef.current = null;
            setLatency((prev) => ({ ...prev, lastInterruptionMs: took }));
            void trackEvent("voice_interrupted", { ms: took });
          }
          break;

        case "response.created":
          activeResponseRef.current = String(
            (message.response as { id?: string } | undefined)?.id || ""
          );
          toolOutputsRef.current = 0;
          break;

        case "output_audio_buffer.started": {
          // The honest "she is audible now" moment on WebRTC, and therefore
          // the honest end of the latency measurement. response.output_audio
          // deltas arrive earlier, before anything reaches the speaker.
          if (speechStoppedAtRef.current) {
            const took = now - speechStoppedAtRef.current;
            speechStoppedAtRef.current = null;
            setLatency((prev) => ({ ...prev, lastResponseMs: took }));
          }
          bumpIdle();
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          const text = String(message.transcript || "").trim();
          if (text) {
            appendTurn({
              id: `s-${message.item_id ?? turnsRef.current.length}`,
              role: "student",
              text,
              atMs: now - startedAtRef.current,
            });
            void trackEvent("voice_student_spoke");
          }
          break;
        }

        case "response.output_audio_transcript.done": {
          const text = String(message.transcript || "").trim();
          if (text) {
            appendTurn({
              id: `v-${message.item_id ?? turnsRef.current.length}`,
              role: "tutor",
              text,
              atMs: now - startedAtRef.current,
            });
            void trackEvent("voice_tutor_responded");
          }
          break;
        }

        case "response.function_call_arguments.done": {
          const name = String(message.name || "");
          const callId = String(message.call_id || "");
          let args: unknown = {};
          try {
            args = JSON.parse(String(message.arguments || "{}"));
          } catch {
            // A malformed tool payload is a model slip, not a crash. The
            // resolver treats an empty object as "just give me the next
            // question", which is the right recovery.
          }

          const result = resolveToolCall(
            tutorSessionRef.current,
            name,
            args,
            now - startedAtRef.current
          );
          tutorSessionRef.current = result.session;
          setTutorSession(result.session);

          send({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: JSON.stringify(result.output),
            },
          });
          toolOutputsRef.current += 1;
          break;
        }

        case "response.done":
          activeResponseRef.current = null;
          // Whether a follow-up turn was requested -- and the guarantee that
          // it happens at most once however many tools this response called
          // -- was decided by planForEvent above. All that is left is to stop
          // counting tool outputs against a response that has finished.
          toolOutputsRef.current = 0;
          break;

        case "error": {
          const err = message.error as { message?: string; code?: string } | undefined;
          console.error("[voice] realtime error", { code: err?.code, message: err?.message });
          break;
        }

        default:
          break;
      }
    },
    [appendTurn, bumpIdle, send]
  );

  const connect = useCallback(
    async (generation: number, isReconnect: boolean) => {
      connectStartedAtRef.current = Date.now();

      // Guard against a handshake that never resolves. Without this the
      // student sits on "Connecting…" indefinitely, which Phase 15 forbids
      // in as many words.
      connectTimeoutRef.current = setTimeout(() => {
        if (generation !== generationRef.current) return;
        if (phaseRef.current === "connecting" || phaseRef.current === "reconnecting") {
          teardown();
          dispatch({ type: "CONNECT_FAILED", kind: "timed_out" });
          void trackEvent("voice_connection_failed", { kind: "timed_out" });
        }
      }, 20000);

      const response = await authFetch("/api/vyra/realtime-session", {
        method: "POST",
        body: JSON.stringify({
          sourceType,
          sourceId,
          options: optionsRef.current,
        }),
      });

      if (generation !== generationRef.current) return;

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.clientSecret) {
        teardown();
        setServerError(typeof data.error === "string" ? data.error : null);
        const kind: CallErrorKind =
          response.status === 401
            ? "auth_failed"
            : response.status === 429
              ? "rate_limited"
              : "session_create_failed";
        dispatch({ type: "CONNECT_FAILED", kind });
        void trackEvent("voice_connection_failed", { kind, status: response.status });
        return;
      }

      // A reconnect keeps the tutoring state it already has -- the whole
      // point is that the student does not start again from nothing -- but
      // takes the fresh session id so the new call is the one that gets
      // saved.
      if (!isReconnect) {
        const concepts = (Array.isArray(data.concepts) ? data.concepts : []) as Concept[];
        const fresh = createSession(concepts, optionsRef.current);

        // The server picked the opening question and baked it into the
        // instructions, so she asks it without a tool round trip. Record it
        // as asked here or the two copies of the session disagree from the
        // first turn: the app would think the concept was never raised and
        // would queue it up again a minute later.
        const opened =
          typeof data.openingConceptId === "string" && fresh.progress[data.openingConceptId]
            ? recordAsked(fresh, data.openingConceptId)
            : fresh;

        tutorSessionRef.current = opened;
        setTutorSession(opened);
        savedRef.current = false;
        setSummary(null);
      }

      sessionIdRef.current = typeof data.sessionId === "string" ? data.sessionId : null;
      setTitle(typeof data.title === "string" ? data.title : null);
      setRemainingMinutes(
        typeof data.remainingMinutes === "number" ? data.remainingMinutes : null
      );
      maxCallMsRef.current =
        typeof data.maxCallMs === "number" && data.maxCallMs > 0
          ? data.maxCallMs
          : 10 * 60 * 1000;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (generation !== generationRef.current) return;
        const [remote] = event.streams;
        const el = audioRef.current;
        if (el) {
          el.srcObject = remote;
          // autoPlay alone is not enough. Chrome and Safari can still refuse,
          // and the rejected promise is silent -- the call looks connected
          // and plays nothing. Ask explicitly so the refusal is catchable.
          el.play()
            .then(() => setNeedsTapToHear(false))
            .catch(() => setNeedsTapToHear(true));
        }
        startMeter(streamRef.current, remote);
      };

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => pc.addTrack(track, streamRef.current!));
      } else {
        // Text-only fallback: no microphone, but we still want to hear her.
        pc.addTransceiver("audio", { direction: "recvonly" });
      }

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;

      channel.onmessage = (event) => handleMessage(event, generation);

      channel.onopen = () => {
        if (generation !== generationRef.current) return;

        // Deliberately NO `instructions` field on this response.create.
        //
        // In the Realtime API, response.instructions REPLACES the session
        // instructions for that response rather than adding to them. An
        // opening prompt here wiped the persona and, worse, the block naming
        // what the student is studying: on a "Cell Structure" deck she once
        // opened by announcing a quiz on world geography. A bare
        // response.create makes her open from the session config, which is
        // where the subject and the tools live.
        send({ type: "response.create" });
      };

      pc.onconnectionstatechange = () => {
        if (generation !== generationRef.current) return;

        if (pc.connectionState === "connected") {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
        }

        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          // Not fatal on its own. A laptop waking up or a phone changing
          // cells passes through "disconnected" and comes back; the machine
          // decides whether we still have retries left.
          dispatch({ type: "CONNECTION_LOST" });
          void trackEvent("voice_connection_failed", { kind: pc.connectionState });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (generation !== generationRef.current) return;

      const answer = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(String(data.model))}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${data.clientSecret}`,
            "Content-Type": "application/sdp",
          },
        }
      );

      if (generation !== generationRef.current) return;

      if (!answer.ok) {
        teardown();
        dispatch({ type: "CONNECT_FAILED", kind: "connect_failed" });
        void trackEvent("voice_connection_failed", { kind: "sdp", status: answer.status });
        return;
      }

      await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });

      if (generation !== generationRef.current) return;

      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }

      setLatency((prev) => ({
        ...prev,
        connectMs: Date.now() - connectStartedAtRef.current,
      }));

      dispatch({ type: isReconnect ? "RECONNECTED" : "CONNECTED" });
      void trackEvent(isReconnect ? "voice_reconnected" : "voice_connection_success", {
        ms: Date.now() - connectStartedAtRef.current,
      });

      // A reconnect keeps the original start time -- it is one call from the
      // student's point of view, and from the budget's.
      if (!isReconnect) {
        startedAtRef.current = Date.now();
        setSeconds(0);
      }

      // Both timers are re-armed on every successful connect, because
      // teardown cleared them on the way in. Arming them only on a fresh
      // call left a reconnected session with a frozen duration display and,
      // far worse, no length ceiling at all -- the one thing standing
      // between an abandoned tab and an unbounded realtime bill.
      tickRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);

      const remainingMs = maxCallMsRef.current - (Date.now() - startedAtRef.current);
      maxCallRef.current = setTimeout(
        () => {
          void finish("timeout");
        },
        // Never zero or negative: a call that reconnects right on the
        // deadline should still get a moment to say goodbye rather than
        // being cut off in the same tick it came back.
        Math.max(5_000, remainingMs)
      );

      bumpIdle();
    },
    [bumpIdle, finish, handleMessage, send, sourceId, sourceType, startMeter, teardown]
  );

  const start = useCallback(
    async (opts: { textOnly?: boolean } = {}) => {
      // Any previous call is finished with, whatever state it left behind.
      generationRef.current += 1;
      const generation = generationRef.current;
      teardown();

      setServerError(null);
      setSummary(null);
      setNeedsTapToHear(false);
      setEverHeardYou(false);
      turnsRef.current = [];
      setTurns([]);
      endedByRef.current = null;
      setTextOnly(opts.textOnly === true);

      dispatch({ type: "START" });
      void trackEvent("voice_session_started", { sourceType, textOnly: opts.textOnly === true });

      if (typeof window !== "undefined" && !window.isSecureContext) {
        dispatch({ type: "MIC_FAILED", kind: "insecure_context" });
        return;
      }

      if (typeof RTCPeerConnection === "undefined") {
        dispatch({ type: "MIC_FAILED", kind: "unsupported_browser" });
        return;
      }

      if (!opts.textOnly) {
        if (!navigator.mediaDevices?.getUserMedia) {
          dispatch({ type: "MIC_FAILED", kind: "unsupported_browser" });
          return;
        }

        try {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            // Without these the student hears the tutor through their own mic
            // a beat later and the model hears itself. The browser's own
            // canceller is far better than anything we could do after the
            // fact.
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          setMicPermission("granted");
        } catch (error) {
          const kind = classifyMediaError(error);
          setMicPermission(kind === "mic_denied" ? "denied" : "unknown");
          dispatch({ type: "MIC_FAILED", kind });
          void trackEvent("voice_connection_failed", { kind });
          return;
        }

        if (generation !== generationRef.current) {
          // Hung up while the permission prompt was open. Do not leave a
          // live microphone behind.
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          return;
        }

        // Honour a mute chosen before the call started.
        streamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !mutedRef.current;
        });

        // A microphone unplugged mid-call is a real thing on a headset, and
        // silence with no explanation is the worst possible response to it.
        streamRef.current.getAudioTracks().forEach((track) => {
          track.onended = () => {
            if (generation !== generationRef.current) return;
            dispatch({ type: "MIC_FAILED", kind: "mic_missing" });
            teardown();
          };
        });
      }

      dispatch({ type: "MIC_GRANTED" });

      try {
        await connect(generation, false);
      } catch (error) {
        if (generation !== generationRef.current) return;
        console.error("[voice] connect threw", {
          message: error instanceof Error ? error.message : String(error),
        });
        teardown();
        dispatch({ type: "CONNECT_FAILED", kind: "connect_failed" });
      }
    },
    [connect, sourceType, teardown]
  );

  // Reconnect loop. Driven by the machine's phase rather than called
  // directly from the error handler, so that however many "disconnected"
  // events fire, only one retry is ever scheduled.
  useEffect(() => {
    if (state.phase !== "reconnecting") return;
    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

    const generation = generationRef.current;
    const delay = reconnectDelayMs(state.reconnectAttempts);

    reconnectRef.current = setTimeout(() => {
      if (generation !== generationRef.current) return;
      dispatch({ type: "RECONNECTING" });

      // Drop the old peer connection before opening a new one, or the two
      // remote tracks both play and she is heard twice, half a second apart.
      // The microphone is kept: it is still granted and still live, and
      // re-acquiring it mid-call would prompt the student again.
      teardown({ keepMicrophone: true });

      void connect(generation, true).catch(() => {
        if (generation !== generationRef.current) return;
        dispatch({ type: "CONNECTION_LOST" });
      });
    }, delay);

    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
  }, [state.phase, state.reconnectAttempts, connect, teardown]);

  // A call that has run out of retries is over. Save what happened.
  useEffect(() => {
    if (state.phase === "error" && state.errorKind === "connection_lost") {
      void saveSession("failed");
    }
  }, [state.phase, state.errorKind, saveSession]);

  const end = useCallback(() => {
    generationRef.current += 1;
    void finish("student");
  }, [finish]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
    dispatch({ type: "TOGGLE_MUTE" });
  }, []);

  /**
   * Commit the buffer and ask for a reply, without waiting for the detector.
   *
   * Voice activity detection is a guess about someone else's microphone in
   * someone else's room, and on a laptop it is the guess most likely to be
   * wrong. This is the escape hatch, and it is available always rather than
   * only after a failure: a student usually knows they have finished talking
   * well before the silence timer does, and waiting on it feels broken even
   * when it is about to fire.
   */
  const sendNow = useCallback(() => {
    if (!isLive({ ...state })) return;
    send({ type: "input_audio_buffer.commit" });
    send({ type: "response.create" });
    bumpIdle();
  }, [bumpIdle, send, state]);

  /** Type instead of talking. The whole session still works. */
  const sendText = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: clean }],
        },
      });
      send({ type: "response.create" });

      appendTurn({
        id: `s-typed-${Date.now()}`,
        role: "student",
        text: clean,
        atMs: Date.now() - startedAtRef.current,
      });
      bumpIdle();
    },
    [appendTurn, bumpIdle, send]
  );

  /** The tap the browser asked for when it refused to autoplay her voice. */
  const enableAudio = useCallback(() => {
    void audioRef.current
      ?.play()
      .then(() => setNeedsTapToHear(false))
      .catch(() => {});
    void audioCtxRef.current?.resume().catch(() => {});
  }, []);

  // Probe the permission state so the pre-call screen can explain itself
  // rather than firing a prompt the student was not expecting. Not supported
  // everywhere (Safari notably), hence the fallback to "unknown".
  useEffect(() => {
    let cancelled = false;
    const permissions = navigator.permissions as
      | { query?: (d: { name: string }) => Promise<PermissionStatus> }
      | undefined;

    if (!permissions?.query) {
      setMicPermission("unknown");
      return;
    }

    permissions
      .query({ name: "microphone" })
      .then((status) => {
        if (cancelled) return;
        setMicPermission(status.state as MicPermission);
        status.onchange = () => {
          if (!cancelled) setMicPermission(status.state as MicPermission);
        };
      })
      .catch(() => {
        if (!cancelled) setMicPermission("unknown");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Unmount, and navigating away, are both hang-ups. This is the effect that
  // stops a ghost microphone surviving a route change -- the single most
  // common way a voice feature ends up recording someone who thinks it is
  // off.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      teardown();
      // Best-effort: keepalive lets the request outlive the page.
      if (sessionIdRef.current && !savedRef.current) {
        void saveSession("completed");
      }
    };
  }, [saveSession, teardown]);

  // A tab put to sleep by the OS stops firing timers, so a call can come
  // back from a closed laptop with a connection that is long dead and a UI
  // that still says "listening". Re-check on wake.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const pc = pcRef.current;
      if (!pc) return;
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        dispatch({ type: "CONNECTION_LOST" });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return {
    state,
    turns,
    tutorSession,
    title,
    seconds,
    level,
    speaker,
    needsTapToHear,
    everHeardYou,
    micPermission,
    summary,
    serverError,
    remainingMinutes,
    latency,
    textOnly,
    audioRef,
    canEnd: canEnd(state),
    start,
    end,
    toggleMute,
    sendNow,
    sendText,
    enableAudio,
  };
}

export type VoiceTutorController = ReturnType<typeof useVoiceTutor>;

/** Re-exported so the UI does not need to know which module owns them. */
export type { CallState, CallEvent };
