"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { CloseIcon } from "@/app/components/app/Icons";

// A real call with Vyra.
//
// The first version of this was turn-based on the browser's Web Speech API:
// tap, speak, wait, listen. That is a walkie-talkie. You cannot interrupt
// it, the latency is a full round trip per turn, and Firefox has no
// SpeechRecognition at all.
//
// This is a WebRTC audio connection straight to OpenAI's realtime model.
// Vyra hears the student as they speak, answers while they are still
// thinking, and stops the moment they start talking again -- which is the
// entire difference between a call and a form.
//
// The browser never holds OPENAI_API_KEY. /api/vyra/realtime-session mints
// an ephemeral secret that expires in a minute and already has Vyra's
// persona and this student's weak topics baked in, so the page cannot
// rewrite who it is talking to.

type CallState = "idle" | "connecting" | "live" | "ended" | "error";

type Turn = { id: string; role: "student" | "vyra"; text: string };

const STATE_LABEL: Record<CallState, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  live: "Listening — just talk",
  ended: "Call ended",
  error: "Couldn't connect",
};

/**
 * A hard ceiling on one call.
 *
 * Realtime audio bills per minute in both directions. A student who walks
 * away with the tab open should not run up a bill, so the call ends itself.
 */
const MAX_CALL_MS = 10 * 60 * 1000;

export function VoiceCall({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    // The microphone track has to be stopped explicitly, or the browser
    // keeps showing the recording indicator after the call is over.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const hangUp = useCallback(() => {
    teardown();
    setState("ended");
    void trackEvent("vyra_call_ended");
  }, [teardown]);

  const start = useCallback(async () => {
    setError(null);
    setTurns([]);
    setState("connecting");
    void trackEvent("vyra_call_started");

    try {
      // 1. Microphone first: if the student declines, nothing else is worth
      // doing and the message should say what actually happened.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setState("error");
        setError(
          "AceDecks needs your microphone to talk. Allow it in your browser's address bar, then try again."
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

      // 3. WebRTC.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (audioRef.current) audioRef.current.srcObject = event.streams[0];
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // The data channel carries the conversation as events, which is how
      // the transcript on screen stays in step with the audio.
      const channel = pc.createDataChannel("oai-events");
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
          // A message shape we do not handle is not a reason to drop a call.
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          teardown();
          setState("error");
          setError("The call dropped. Check your connection and try again.");
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

      timeoutRef.current = setTimeout(() => {
        hangUp();
        setError("Calls stop after ten minutes. Start another whenever you like.");
      }, MAX_CALL_MS);
    } catch {
      teardown();
      setState("error");
      setError("Could not start the call. Please try again.");
    }
  }, [teardown, hangUp]);

  const toggleMute = useCallback(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    const next = !isMuted;
    tracks.forEach((track) => (track.enabled = !next));
    setIsMuted(next);
  }, [isMuted]);

  const isLive = state === "live";
  const isBusy = state === "connecting";

  return (
    <div className="card p-6" role="region" aria-label="Talking to Vyra">
      {/* Vyra's voice. Muted-by-default autoplay is blocked, so this is only
          ever attached after an explicit tap on Start. */}
      <audio ref={audioRef} autoPlay className="hidden" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="t-section">Talking to Vyra</p>
          <p className="t-meta mt-1" aria-live="polite">
            {STATE_LABEL[state]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            hangUp();
            onClose();
          }}
          aria-label="Close"
          className="btn btn-quiet btn-sm"
          style={{ color: "var(--text-3)" }}
        >
          <CloseIcon className="h-4 w-4" />
          Close
        </button>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <div
          aria-hidden="true"
          className="flex h-24 w-24 items-center justify-center rounded-full"
          style={{
            background: isLive ? "var(--accent)" : "var(--accent-soft)",
            border: "2px solid var(--accent-line)",
            color: isLive ? "var(--on-brand)" : "var(--accent-bright)",
            animation: isLive && !isMuted ? "mic-ring-pulse 1.6s ease-in-out infinite" : undefined,
          }}
        >
          <MicGlyph className="h-10 w-10" muted={isMuted} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {!isLive ? (
            <button
              type="button"
              onClick={() => void start()}
              disabled={isBusy}
              className="btn btn-primary btn-lg"
            >
              {isBusy ? "Connecting…" : state === "ended" ? "Call again" : "Start talking"}
            </button>
          ) : (
            <>
              <button type="button" onClick={toggleMute} className="btn btn-secondary">
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={hangUp}
                className="btn"
                style={{ background: "var(--bad-soft)", color: "var(--bad)" }}
              >
                End call
              </button>
            </>
          )}
        </div>

        {!isLive && state !== "ended" && (
          <p className="t-meta mt-3 text-center">
            Vyra already knows what you have been studying and what you keep
            getting wrong. Just start talking &mdash; you can interrupt her.
          </p>
        )}
      </div>

      {error && (
        <p className="t-meta mt-5" role="alert" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      {turns.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <p className="t-section">Transcript</p>
          {turns.map((turn) => (
            <div key={turn.id}>
              <p className="t-meta">{turn.role === "student" ? "You" : "Vyra"}</p>
              <p className="t-body">{turn.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MicGlyph({ className, muted }: { className?: string; muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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
