"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceStudyMode } from "@/lib/useVoiceStudyMode";
import { trackEvent } from "@/lib/trackEvent";
import { CloseIcon } from "@/app/components/app/Icons";

// Talking to Vyra instead of typing at her.
//
// Built on the Web Speech API primitives already in lib/useVoiceStudyMode.ts
// (the battle screen has used them for hands-free answering for a while):
// SpeechRecognition to hear one turn, SpeechSynthesis to read the reply
// back. No new dependency, no new API key, and it works offline-ish in
// Chrome, Edge and Safari.
//
// It is a *turn-based* call, not a live one. The browser's recogniser
// finalises on a pause, so the shape is listen -> think -> speak -> listen,
// which is honest about what this can do rather than pretending to be a
// full-duplex phone call it would drop words in. Firefox has no
// SpeechRecognition at all, which is why isSupported gates the whole entry
// point rather than failing on the first tap.

type CallState = "idle" | "listening" | "thinking" | "speaking";

const STATE_LABEL: Record<CallState, string> = {
  idle: "Tap to talk",
  listening: "Listening…",
  thinking: "Vyra is thinking…",
  speaking: "Vyra is talking",
};

export function VoiceCall({
  onAsk,
  onClose,
}: {
  /** Sends one spoken turn and resolves with what Vyra said back. */
  onAsk: (text: string) => Promise<string>;
  onClose: () => void;
}) {
  const voice = useVoiceStudyMode();
  const [state, setState] = useState<CallState>("idle");
  const [heard, setHeard] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A hung-up call must not keep listening or talking into an empty room.
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      voice.stopListening();
      voice.cancelSpeech();
    };
  }, [voice]);

  const runTurn = useCallback(async () => {
    setError(null);
    setState("listening");
    setHeard(null);
    setReply(null);

    const transcript = await voice.listenOnce();
    if (!isMountedRef.current) return;

    if (!transcript) {
      setState("idle");
      setError("I didn't catch that. Try again, a little closer to the mic.");
      return;
    }

    setHeard(transcript);
    setState("thinking");

    try {
      const answer = await onAsk(transcript);
      if (!isMountedRef.current) return;

      setReply(answer);
      setState("speaking");
      await voice.speak(answer);
      if (!isMountedRef.current) return;
      setState("idle");
    } catch {
      if (!isMountedRef.current) return;
      setState("idle");
      setError("Vyra could not answer that. Try again in a moment.");
    }
  }, [voice, onAsk]);

  const hangUp = useCallback(() => {
    voice.stopListening();
    voice.cancelSpeech();
    void trackEvent("vyra_call_ended");
    onClose();
  }, [voice, onClose]);

  if (!voice.isSupported) {
    return (
      <div className="card p-5" role="status">
        <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
          Talking isn&rsquo;t available in this browser
        </p>
        <p className="t-meta mt-1">
          Voice needs Chrome, Edge or Safari. You can still type to Vyra &mdash;
          she answers exactly the same.
        </p>
        <button type="button" onClick={onClose} className="btn btn-secondary btn-sm mt-4">
          Back to typing
        </button>
      </div>
    );
  }

  const isBusy = state !== "idle";

  return (
    <div className="card p-6 text-center" role="region" aria-label="Talking to Vyra">
      <div className="flex items-start justify-between gap-3 text-left">
        <div>
          <p className="t-section">Talking to Vyra</p>
          <p className="t-meta mt-1" aria-live="polite">
            {STATE_LABEL[state]}
          </p>
        </div>
        <button
          type="button"
          onClick={hangUp}
          aria-label="End call"
          className="btn btn-quiet btn-sm"
          style={{ color: "var(--text-3)" }}
        >
          <CloseIcon className="h-4 w-4" />
          End
        </button>
      </div>

      {/* The one control. Big, round, and obviously tappable. */}
      <button
        type="button"
        onClick={() => void runTurn()}
        disabled={isBusy}
        aria-label={state === "listening" ? "Listening" : "Tap and speak"}
        className="mx-auto mt-6 flex h-28 w-28 items-center justify-center rounded-full transition-transform active:scale-95"
        style={{
          background: state === "listening" ? "var(--accent)" : "var(--accent-soft)",
          border: "2px solid var(--accent-line)",
          color: state === "listening" ? "var(--on-brand)" : "var(--accent-bright)",
          opacity: isBusy && state !== "listening" ? 0.6 : 1,
          cursor: isBusy ? "default" : "pointer",
        }}
      >
        <MicGlyph className="h-11 w-11" animated={state === "listening"} />
      </button>

      <p className="t-meta mt-4">
        {state === "idle"
          ? "Ask her anything about what you are studying."
          : STATE_LABEL[state]}
      </p>

      {heard && (
        <p className="t-body mt-6 text-left">
          <span className="t-section">You said</span>
          <br />
          {heard}
        </p>
      )}

      {reply && (
        <p className="t-body mt-4 text-left">
          <span className="t-section">Vyra</span>
          <br />
          {reply}
        </p>
      )}

      {error && (
        <p className="t-meta mt-4" role="alert" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function MicGlyph({ className, animated }: { className?: string; animated?: boolean }) {
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
      style={animated ? { animation: "mic-ring-pulse 1.4s ease-in-out infinite" } : undefined}
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}
