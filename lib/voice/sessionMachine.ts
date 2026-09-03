// The call's state, as one value.
//
// The brief is explicit that a pile of booleans -- isListening, isTalking,
// isConnecting, isMuted -- is the wrong model, and it is right for a reason
// that shows up immediately in a real call: those flags are set by six
// different event handlers racing each other, so the UI ends up claiming to
// be "listening" and "reconnecting" at once, and no amount of reading the
// component tells you which is true.
//
// So there is exactly one `phase`, and the only way to change it is through
// `transition`. Mute is the one genuinely orthogonal thing (you can be muted
// while listening, speaking or reconnecting), so it is a separate field --
// but it is a field on the same object, not a second source of truth.

export type CallPhase =
  | "idle"
  | "requesting_mic"
  | "connecting"
  | "ready"
  | "listening"
  | "student_speaking"
  | "thinking"
  | "tutor_speaking"
  | "reconnecting"
  | "ending"
  | "ended"
  | "error";

/**
 * Why the call failed, kept apart from the phase.
 *
 * A permission refusal and a dropped network both land in `error`, and the
 * recovery instructions for them share not one word. Phase 15 wants every
 * one of these to say something specific, so the reason travels with the
 * state rather than being reconstructed from an error string.
 */
export type CallErrorKind =
  | "mic_denied"
  | "mic_missing"
  | "mic_busy"
  | "unsupported_browser"
  | "insecure_context"
  | "auth_failed"
  | "rate_limited"
  | "session_create_failed"
  | "connect_failed"
  | "connection_lost"
  | "timed_out"
  | "unknown";

export type CallState = {
  phase: CallPhase;
  muted: boolean;
  errorKind: CallErrorKind | null;
  /** How many reconnects have been attempted for this call. */
  reconnectAttempts: number;
  /** True once audio has actually been exchanged, i.e. the call really happened. */
  hadConversation: boolean;
};

export type CallEvent =
  | { type: "START" }
  | { type: "MIC_GRANTED" }
  | { type: "MIC_FAILED"; kind: CallErrorKind }
  | { type: "CONNECTED" }
  | { type: "CONNECT_FAILED"; kind: CallErrorKind }
  | { type: "STUDENT_SPEECH_STARTED" }
  | { type: "STUDENT_SPEECH_STOPPED" }
  | { type: "RESPONSE_STARTED" }
  | { type: "AUDIO_STARTED" }
  | { type: "RESPONSE_DONE" }
  | { type: "CONNECTION_LOST" }
  | { type: "RECONNECTING" }
  | { type: "RECONNECTED" }
  | { type: "TOGGLE_MUTE" }
  | { type: "SET_MUTE"; muted: boolean }
  | { type: "END" }
  | { type: "ENDED" }
  | { type: "RESET" };

export const INITIAL_CALL_STATE: CallState = {
  phase: "idle",
  muted: false,
  errorKind: null,
  reconnectAttempts: 0,
  hadConversation: false,
};

/** Phases where the connection is up and audio may be flowing. */
const LIVE_PHASES: ReadonlySet<CallPhase> = new Set([
  "ready",
  "listening",
  "student_speaking",
  "thinking",
  "tutor_speaking",
]);

export function isLive(state: CallState): boolean {
  return LIVE_PHASES.has(state.phase);
}

/** Phases from which no further audio will arrive. */
export function isTerminal(state: CallState): boolean {
  return state.phase === "ended" || state.phase === "error";
}

/** True when the student is allowed to hang up. */
export function canEnd(state: CallState): boolean {
  return isLive(state) || state.phase === "reconnecting" || state.phase === "connecting";
}

export const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Backoff before retrying a dropped connection.
 *
 * Immediate retries are worse than useless during the case this exists for
 * -- a laptop waking up or a phone moving between cells, where the radio is
 * not ready for another second or two -- and each attempt mints a fresh
 * session, which costs money. Growing the gap means three attempts cover
 * about seven seconds instead of hammering three times in 300ms.
 */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(8000, 800 * 2 ** Math.max(0, attempt));
}

export function transition(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case "START":
      // Restarting from ended/error is a normal thing to do and must clear
      // the previous failure, or the second call renders with the first
      // call's error message still under it.
      return {
        ...INITIAL_CALL_STATE,
        muted: state.muted,
        phase: "requesting_mic",
      };

    case "MIC_GRANTED":
      return state.phase === "requesting_mic" ? { ...state, phase: "connecting" } : state;

    case "MIC_FAILED":
      return { ...state, phase: "error", errorKind: event.kind };

    case "CONNECTED":
      if (state.phase !== "connecting" && state.phase !== "reconnecting") return state;
      return { ...state, phase: "listening", errorKind: null, reconnectAttempts: 0 };

    case "CONNECT_FAILED":
      return { ...state, phase: "error", errorKind: event.kind };

    case "STUDENT_SPEECH_STARTED":
      // Barge-in: the student talking over the tutor is not an error state,
      // it is the point. Whatever phase we were in, we are now listening to
      // them.
      if (!isLive(state)) return state;
      return { ...state, phase: "student_speaking", hadConversation: true };

    case "STUDENT_SPEECH_STOPPED":
      if (state.phase !== "student_speaking") return state;
      return { ...state, phase: "thinking" };

    case "RESPONSE_STARTED":
      if (!isLive(state)) return state;
      return { ...state, phase: "thinking" };

    case "AUDIO_STARTED":
      if (!isLive(state)) return state;
      return { ...state, phase: "tutor_speaking", hadConversation: true };

    case "RESPONSE_DONE":
      // Ignored unless we were mid-response: a `response.done` for a
      // response the student already interrupted must not yank the UI out
      // of "student_speaking" and back to idle listening.
      if (state.phase !== "tutor_speaking" && state.phase !== "thinking") return state;
      return { ...state, phase: "listening" };

    case "CONNECTION_LOST":
      if (isTerminal(state) || state.phase === "ending") return state;
      if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        return { ...state, phase: "error", errorKind: "connection_lost" };
      }
      return { ...state, phase: "reconnecting" };

    case "RECONNECTING":
      if (state.phase !== "reconnecting") return state;
      return { ...state, reconnectAttempts: state.reconnectAttempts + 1 };

    case "RECONNECTED":
      if (state.phase !== "reconnecting") return state;
      return { ...state, phase: "listening", errorKind: null, reconnectAttempts: 0 };

    case "TOGGLE_MUTE":
      return { ...state, muted: !state.muted };

    case "SET_MUTE":
      return { ...state, muted: event.muted };

    case "END":
      if (isTerminal(state)) return state;
      return { ...state, phase: "ending" };

    case "ENDED":
      return { ...state, phase: "ended", errorKind: null };

    case "RESET":
      return { ...INITIAL_CALL_STATE };

    default:
      return state;
  }
}

/**
 * The one line of status text under the orb.
 *
 * Centralised so the UI cannot invent a combination the machine forbids --
 * "Listening" while muted was a real bug in the previous screen, and it is
 * the kind that makes a student sit there repeating themselves.
 */
export function statusLabel(state: CallState, opts: { needsTapToHear?: boolean } = {}): string {
  if (opts.needsTapToHear && isLive(state)) return "Tap to turn the sound on";

  switch (state.phase) {
    case "idle":
      return "Ready when you are";
    case "requesting_mic":
      return "Waiting for microphone access…";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting…";
    case "ready":
      return "Connected";
    case "listening":
      return state.muted ? "Muted — tap the mic to talk" : "Listening";
    case "student_speaking":
      return state.muted ? "Muted — tap the mic to talk" : "I can hear you…";
    case "thinking":
      return "Thinking…";
    case "tutor_speaking":
      return "Vyra is speaking";
    case "ending":
      return "Wrapping up…";
    case "ended":
      return "Call ended";
    case "error":
      return "Call stopped";
    default:
      return "";
  }
}

/**
 * What to actually tell the student when something breaks, and how to fix it.
 *
 * Phase 15's rule is that no failure leaves them on a spinner with nothing to
 * do, so every kind here names the cause and the next action.
 */
export function errorMessage(kind: CallErrorKind): string {
  switch (kind) {
    case "mic_denied":
      return "Vyra needs your microphone to hear you. Allow microphone access from the icon in your browser's address bar, then start the call again.";
    case "mic_missing":
      return "No microphone was found. Plug one in or connect a headset, then try again.";
    case "mic_busy":
      return "Another app is using your microphone. Close it — video calls are the usual culprit — and try again.";
    case "unsupported_browser":
      return "This browser can't do live calls. Chrome, Edge or Safari will work — or keep going in the chat below.";
    case "insecure_context":
      return "Live calls need a secure (https) connection. Open AceDecks over https and try again.";
    case "auth_failed":
      return "Your session expired. Log in again to call Vyra.";
    case "rate_limited":
      return "You've started a lot of calls in the last hour. Take a short break and try again.";
    case "session_create_failed":
      return "Vyra couldn't start the call. Try again in a moment.";
    case "connect_failed":
      return "Couldn't reach Vyra. Check your connection and start the call again.";
    case "connection_lost":
      return "The call dropped and couldn't reconnect. Your progress up to this point has been saved.";
    case "timed_out":
      return "Connecting took too long. Check your connection and try again.";
    default:
      return "Something went wrong with the call. Please try again.";
  }
}

/**
 * Turn a getUserMedia rejection into something we can act on.
 *
 * The DOMException names are the only reliable signal here; the messages are
 * browser-specific prose. Firefox and Safari disagree with Chrome on which
 * name a busy device gets, hence the pairs.
 */
export function classifyMediaError(error: unknown): CallErrorKind {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "mic_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "mic_missing";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "mic_busy";
    default:
      return "unknown";
  }
}
