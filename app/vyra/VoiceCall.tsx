"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";

// The call screen.
//
// A WebRTC audio connection straight to OpenAI's realtime model: Vyra hears
// the student while they are still speaking, answers, and stops the moment
// they start again. Audio never passes through our own server -- proxying it
// would double the latency and Vercel functions cannot hold a long-lived
// socket anyway. The browser gets a one-minute ephemeral key from
// /api/vyra/realtime-session and connects direct.
//
// The circle in the middle is driven by real audio. Two AnalyserNodes, one
// on the microphone and one on Vyra's returning stream, so it swells with
// whoever is actually talking rather than animating on a timer. That is the
// difference between a call that feels alive and a spinner with a gradient.

type CallState = "idle" | "connecting" | "live" | "ended" | "error";

type Turn = { id: string; role: "student" | "vyra"; text: string };

/**
 * A hard ceiling on one call.
 *
 * Realtime audio bills per minute in both directions. A student who walks
 * away with the tab open must not run up a bill, so the call ends itself.
 */
const MAX_CALL_MS = 10 * 60 * 1000;

export function VoiceCall({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  // Whose voice is currently moving the circle, and how much.
  // Set when the browser refuses to play Vyra's audio without a fresh tap.
  // Without this the call connects, she talks, and the student hears
  // nothing at all with no explanation -- silent dead air.
  const [needsTapToHear, setNeedsTapToHear] = useState(false);
  const [level, setLevel] = useState(0);
  const [speaker, setSpeaker] = useState<"student" | "vyra" | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    rafRef.current = null;
    timerRef.current = null;
    timeoutRef.current = null;

    // The microphone track has to be stopped explicitly or the browser keeps
    // showing its recording indicator after the call is over.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    setLevel(0);
    setSpeaker(null);
    setNeedsTapToHear(false);
  }, []);

  useEffect(() => teardown, [teardown]);

  const hangUp = useCallback(() => {
    teardown();
    setState("ended");
    void trackEvent("vyra_call_ended");
  }, [teardown]);

  /** Drives the avatar from the two live audio streams. */
  const startMeter = useCallback((mic: MediaStream, remote: MediaStream) => {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

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
    const micNode = analyse(mic);
    const vyraNode = analyse(remote);
    const buffer = new Uint8Array(micNode.frequencyBinCount);

    const rms = (node: AnalyserNode) => {
      node.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buffer.length);
    };

    const tick = () => {
      const micLevel = streamRef.current?.getAudioTracks()[0]?.enabled ? rms(micNode) : 0;
      const vyraLevel = rms(vyraNode);

      // Vyra wins ties: while she is talking the student's own voice is
      // usually still bleeding into the mic a little.
      const loudest = Math.max(micLevel, vyraLevel);
      setSpeaker(loudest < 0.02 ? null : vyraLevel >= micLevel ? "vyra" : "student");
      setLevel(Math.min(1, loudest * 3.2));

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setTurns([]);
    setSeconds(0);
    setState("connecting");
    void trackEvent("vyra_call_started");

    try {
      // 1. Microphone first. If the student declines there is nothing else
      // worth doing, and the message should say what actually happened.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Without these the student hears Vyra through their own mic a
          // beat later and the model hears itself. The browser's own AEC is
          // far better than anything we could do after the fact.
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        setState("error");
        setError(
          "AceDecks needs your microphone to talk. Allow it from your browser's address bar, then try again."
        );
        return;
      }
      streamRef.current = stream;

      // 2. A one-minute key scoped to this session.
      const response = await authFetch("/api/vyra/realtime-session", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.clientSecret) {
        teardown();
        setState("error");
        setError(data.error || "Could not start the call. Please try again.");
        return;
      }
      setTopic(typeof data.topic === "string" ? data.topic : null);

      // 3. WebRTC.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
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
        startMeter(stream, remote);
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // The data channel carries the conversation as events, which is how
      // the transcript stays in step with the audio.
      const channel = pc.createDataChannel("oai-events");

      // Vyra speaks first.
      //
      // With server_vad the model waits for the student, so without this the
      // call opens on silence and the student has to work out that it is
      // their move. Asking for a response the moment the channel is ready
      // means they hear "Okay -- Cell Structure. Ready?" and the thing feels
      // like a call instead of an open microphone.
      channel.onopen = () => {
        // Deliberately NO `instructions` field here.
        //
        // In the Realtime API, response.instructions REPLACES the session
        // instructions for that response -- it does not add to them. Passing
        // an opening prompt here wiped the persona and, worse, the block
        // naming what this student is studying: on a "Cell Structure" deck
        // she opened by announcing a quiz on world geography, then on
        // environmental science. Sending a bare response.create makes her
        // open using the session config, which is where the subject lives.
        channel.send(JSON.stringify({ type: "response.create" }));
      };

      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "conversation.item.input_audio_transcription.completed") {
            const text = String(message.transcript || "").trim();
            if (text) {
              setTurns((prev) => [
                ...prev,
                { id: `s-${message.item_id ?? prev.length}`, role: "student", text },
              ]);
            }
          }

          if (message.type === "response.output_audio_transcript.done") {
            const text = String(message.transcript || "").trim();
            if (text) {
              setTurns((prev) => [
                ...prev,
                { id: `v-${message.item_id ?? prev.length}`, role: "vyra", text },
              ]);
            }
          }
        } catch {
          // An event shape we do not handle is not a reason to drop a call.
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          teardown();
          setState("error");
          setError("The call dropped. Check your connection and start again.");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const answer = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(data.model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${data.clientSecret}`,
            "Content-Type": "application/sdp",
          },
        }
      );

      if (!answer.ok) {
        teardown();
        setState("error");
        setError("Could not reach Vyra. Please try again in a moment.");
        return;
      }

      await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      setState("live");

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      timeoutRef.current = setTimeout(() => {
        hangUp();
        setError("Calls stop after ten minutes. Start another whenever you like.");
      }, MAX_CALL_MS);
    } catch {
      teardown();
      setState("error");
      setError("Could not start the call. Please try again.");
    }
  }, [teardown, hangUp, startMeter]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
    setIsMuted(next);
  }, [isMuted]);

  const isLive = state === "live";
  const isBusy = state === "connecting";

  const status = isLive
    ? needsTapToHear
      ? "Tap below to turn her voice on"
      : isMuted
      ? "Muted"
      : speaker === "vyra"
        ? "Vyra is speaking"
        : speaker === "student"
          ? "Listening"
          : "Go ahead — just talk"
    : isBusy
      ? "Connecting…"
      : state === "ended"
        ? "Call ended"
        : state === "error"
          ? "Couldn't connect"
          : "Ready when you are";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Call with Vyra"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, #241a52 0%, var(--app-bg) 62%), var(--app-bg)",
      }}
    >
      {/* Vyra's voice. Only ever attached after an explicit tap on Start, so
          autoplay policy is never in the way. */}
      {/* The `hidden` class this used to carry was redundant, not harmful:
          the UA stylesheet already applies `audio:not([controls]) { display:
          none }`, and a display-none audio element still plays -- verified.
          What actually caused silence was the autoPlay promise being
          rejected with nobody catching it; see pc.ontrack above.
          playsInline keeps iOS from trying to take it fullscreen. */}
      <audio ref={audioRef} autoPlay playsInline />

      {/* ---- Deck topic ---- */}
      <div className="flex justify-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div
          className="w-full max-w-md rounded-[var(--radius-lg)] border px-4 py-3 text-center"
          style={{
            borderColor: "var(--accent-line)",
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
            backdropFilter: "blur(10px)",
          }}
        >
          <p className="t-section">Studying</p>
          <p
            className="mt-0.5 truncate text-[15px] font-medium"
            style={{ color: "var(--text-1)" }}
          >
            {topic || "Whatever you want to work on"}
          </p>
        </div>
      </div>

      {/* ---- The avatar ---- */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative flex h-64 w-64 items-center justify-center">
          {/* Two rings that breathe with the audio. Transform only, so this
              stays on the compositor and never triggers layout. */}
          {[0, 1].map((ring) => (
            <span
              key={ring}
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                inset: 0,
                border: "1px solid var(--accent-line)",
                transform: `scale(${0.72 + level * (ring ? 0.34 : 0.2)})`,
                opacity: 0.16 + level * (ring ? 0.28 : 0.45),
                transition: "transform 90ms linear, opacity 90ms linear",
              }}
            />
          ))}

          <span
            aria-hidden="true"
            className="absolute rounded-full"
            style={{
              height: "9rem",
              width: "9rem",
              background:
                "radial-gradient(circle at 32% 28%, #b9a8ff 0%, var(--accent) 48%, #4a3596 100%)",
              transform: `scale(${1 + level * 0.16})`,
              boxShadow: `0 0 ${28 + level * 70}px ${level * 14}px rgb(124 106 240 / ${0.22 + level * 0.34})`,
              transition: "transform 90ms linear, box-shadow 90ms linear",
            }}
          />

          <span
            className="relative text-[15px] font-medium tracking-[0.28em]"
            style={{ color: "#ffffff", textShadow: "0 1px 12px rgb(0 0 0 / 0.45)" }}
          >
            VYRA
          </span>
        </div>

        <p className="t-body mt-8 text-center" aria-live="polite">
          {status}
        </p>
        {isLive && (
          <p className="t-meta mt-1 tabular-nums">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </p>
        )}

        {!isLive && state !== "ended" && !error && (
          <p className="t-meta mt-4 max-w-xs text-center">
            Vyra already knows what you have been studying and what you keep
            getting wrong. You can interrupt her.
          </p>
        )}

        {/* The browser refused to play her. Offer the tap it is asking for
            rather than leaving the student in silence wondering whether the
            call is broken. */}
        {needsTapToHear && (
          <button
            type="button"
            onClick={() => {
              void audioRef.current
                ?.play()
                .then(() => setNeedsTapToHear(false))
                .catch(() => {});
              void audioCtxRef.current?.resume().catch(() => {});
            }}
            className="btn btn-primary mt-5"
          >
            Tap to hear Vyra
          </button>
        )}

        {error && (
          <p
            role="alert"
            className="t-meta mt-4 max-w-xs text-center"
            style={{ color: "var(--bad)" }}
          >
            {error}
          </p>
        )}
      </div>

      {/* ---- Transcript ---- */}
      {turns.length > 0 && (
        <div className="mx-auto w-full max-w-md flex-none overflow-y-auto px-6" style={{ maxHeight: "22vh" }}>
          {turns.slice(-6).map((turn) => (
            <p key={turn.id} className="t-meta mb-2">
              <span style={{ color: turn.role === "vyra" ? "var(--accent-bright)" : "var(--text-3)" }}>
                {turn.role === "vyra" ? "Vyra" : "You"}:{" "}
              </span>
              <span style={{ color: "var(--text-2)" }}>{turn.text}</span>
            </p>
          ))}
        </div>
      )}

      {/* ---- Controls ---- */}
      <div className="flex items-center justify-center gap-5 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
        {isLive ? (
          <>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={isMuted}
              className="flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95"
              style={{
                background: isMuted ? "var(--accent)" : "var(--panel-raised)",
                border: "1px solid var(--line-strong)",
                color: isMuted ? "var(--on-brand)" : "var(--text-1)",
              }}
            >
              <MicIcon className="h-6 w-6" muted={isMuted} />
            </button>

            <button
              type="button"
              onClick={hangUp}
              aria-label="End call"
              className="flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95"
              style={{ background: "#e5484d", color: "#ffffff" }}
            >
              <EndCallIcon className="h-6 w-6" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void start()}
              disabled={isBusy}
              className="btn btn-primary btn-lg"
            >
              {isBusy ? "Connecting…" : state === "ended" ? "Call again" : "Start talking"}
            </button>
            <button type="button" onClick={onClose} className="btn btn-secondary btn-lg">
              Back to chat
            </button>
          </>
        )}
      </div>

      {isLive && (
        <button
          type="button"
          onClick={() => {
            hangUp();
            onClose();
          }}
          className="t-meta pb-6 text-center underline underline-offset-2"
        >
          Back to chat
        </button>
      )}
    </div>
  );
}

function MicIcon({ className, muted }: { className?: string; muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

function EndCallIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* A handset rotated down: the universal "hang up". */}
      <g transform="rotate(135 12 12)">
        <path d="M4.5 5.5a2 2 0 0 1 2-2h1.6a1 1 0 0 1 1 .77l.7 3a1 1 0 0 1-.29.95l-1.3 1.2a12 12 0 0 0 5.1 5.1l1.2-1.3a1 1 0 0 1 .95-.29l3 .7a1 1 0 0 1 .77 1v1.6a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5Z" />
      </g>
    </svg>
  );
}
