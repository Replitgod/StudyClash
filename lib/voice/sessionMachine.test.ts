import { describe, expect, it } from "vitest";
import {
  INITIAL_CALL_STATE,
  MAX_RECONNECT_ATTEMPTS,
  canEnd,
  classifyMediaError,
  errorMessage,
  isLive,
  isTerminal,
  reconnectDelayMs,
  statusLabel,
  transition,
  type CallErrorKind,
  type CallEvent,
  type CallState,
} from "./sessionMachine";

/** Drive the machine through a list of events, as a real call would. */
function run(events: CallEvent[], from: CallState = INITIAL_CALL_STATE): CallState {
  return events.reduce(transition, from);
}

const CONNECTED = run([
  { type: "START" },
  { type: "MIC_GRANTED" },
  { type: "CONNECTED" },
]);

describe("the happy path", () => {
  it("reaches a listening call from idle", () => {
    expect(CONNECTED.phase).toBe("listening");
    expect(isLive(CONNECTED)).toBe(true);
    expect(CONNECTED.errorKind).toBeNull();
  });

  it("follows a whole question-and-answer turn", () => {
    const state = run(
      [
        { type: "STUDENT_SPEECH_STARTED" },
        { type: "STUDENT_SPEECH_STOPPED" },
        { type: "RESPONSE_STARTED" },
        { type: "AUDIO_STARTED" },
        { type: "RESPONSE_DONE" },
      ],
      CONNECTED
    );

    expect(state.phase).toBe("listening");
    expect(state.hadConversation).toBe(true);
  });
});

describe("illegal states are unreachable", () => {
  it("cannot be listening before the microphone is granted", () => {
    const state = run([{ type: "START" }, { type: "CONNECTED" }]);
    // CONNECTED arriving in requesting_mic is ignored rather than skipping
    // the permission step.
    expect(state.phase).toBe("requesting_mic");
  });

  it("ignores speech events when the call is not live", () => {
    const ended = run([{ type: "END" }, { type: "ENDED" }], CONNECTED);
    const after = transition(ended, { type: "STUDENT_SPEECH_STARTED" });
    expect(after.phase).toBe("ended");
  });

  it("never reports speaking and muted at the same time in the status line", () => {
    const muted = transition(CONNECTED, { type: "TOGGLE_MUTE" });
    const speaking = transition(muted, { type: "STUDENT_SPEECH_STARTED" });

    expect(speaking.muted).toBe(true);
    expect(statusLabel(speaking)).toMatch(/muted/i);
    expect(statusLabel(speaking)).not.toMatch(/I can hear you/i);
  });

  it("keeps mute across a reconnect, because the student chose it", () => {
    const muted = transition(CONNECTED, { type: "TOGGLE_MUTE" });
    const state = run(
      [{ type: "CONNECTION_LOST" }, { type: "RECONNECTING" }, { type: "RECONNECTED" }],
      muted
    );

    expect(state.muted).toBe(true);
    expect(state.phase).toBe("listening");
  });
});

describe("barge-in", () => {
  it("switches to the student the instant they talk over the tutor", () => {
    const speaking = run(
      [{ type: "RESPONSE_STARTED" }, { type: "AUDIO_STARTED" }],
      CONNECTED
    );
    expect(speaking.phase).toBe("tutor_speaking");

    const interrupted = transition(speaking, { type: "STUDENT_SPEECH_STARTED" });
    expect(interrupted.phase).toBe("student_speaking");
  });

  it("ignores the cancelled response finishing, so the UI does not flicker back", () => {
    const interrupted = run(
      [
        { type: "RESPONSE_STARTED" },
        { type: "AUDIO_STARTED" },
        { type: "STUDENT_SPEECH_STARTED" },
        // The response the student just cut off reports done a moment later.
        { type: "RESPONSE_DONE" },
      ],
      CONNECTED
    );

    // Still listening to the student, not yanked back to idle listening.
    expect(interrupted.phase).toBe("student_speaking");
  });

  it("survives repeated interruptions without ending up in a wrong state", () => {
    let state = CONNECTED;
    for (let i = 0; i < 10; i += 1) {
      state = run(
        [
          { type: "RESPONSE_STARTED" },
          { type: "AUDIO_STARTED" },
          { type: "STUDENT_SPEECH_STARTED" },
          { type: "STUDENT_SPEECH_STOPPED" },
        ],
        state
      );
    }
    expect(state.phase).toBe("thinking");
    expect(isLive(state)).toBe(true);
  });
});

describe("reconnecting", () => {
  it("tries to recover rather than failing on the first drop", () => {
    const state = transition(CONNECTED, { type: "CONNECTION_LOST" });
    expect(state.phase).toBe("reconnecting");
    expect(isTerminal(state)).toBe(false);
  });

  it("gives up after a bounded number of attempts", () => {
    let state = CONNECTED;
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i += 1) {
      state = transition(state, { type: "CONNECTION_LOST" });
      state = transition(state, { type: "RECONNECTING" });
    }

    state = transition(state, { type: "CONNECTION_LOST" });
    expect(state.phase).toBe("error");
    expect(state.errorKind).toBe("connection_lost");
  });

  it("clears the attempt count once a reconnect succeeds", () => {
    const state = run(
      [{ type: "CONNECTION_LOST" }, { type: "RECONNECTING" }, { type: "RECONNECTED" }],
      CONNECTED
    );
    expect(state.reconnectAttempts).toBe(0);
    expect(state.phase).toBe("listening");
  });

  it("does not try to reconnect a call the student is hanging up", () => {
    const ending = transition(CONNECTED, { type: "END" });
    const state = transition(ending, { type: "CONNECTION_LOST" });
    expect(state.phase).toBe("ending");
  });

  it("backs off between attempts instead of hammering", () => {
    expect(reconnectDelayMs(0)).toBeLessThan(reconnectDelayMs(1));
    expect(reconnectDelayMs(1)).toBeLessThan(reconnectDelayMs(2));
    expect(reconnectDelayMs(10)).toBeLessThanOrEqual(8000);
  });
});

describe("restarting", () => {
  it("clears the previous failure so the second call is not haunted by the first", () => {
    const failed = run([{ type: "START" }, { type: "MIC_FAILED", kind: "mic_denied" }]);
    expect(failed.errorKind).toBe("mic_denied");

    const restarted = transition(failed, { type: "START" });
    expect(restarted.errorKind).toBeNull();
    expect(restarted.phase).toBe("requesting_mic");
    expect(restarted.hadConversation).toBe(false);
  });

  it("can run several sessions back to back", () => {
    let state = CONNECTED;
    for (let i = 0; i < 3; i += 1) {
      state = run([{ type: "END" }, { type: "ENDED" }], state);
      expect(state.phase).toBe("ended");
      state = run([{ type: "START" }, { type: "MIC_GRANTED" }, { type: "CONNECTED" }], state);
      expect(state.phase).toBe("listening");
    }
  });
});

describe("canEnd", () => {
  it("lets the student hang up from any state where a call exists", () => {
    expect(canEnd(CONNECTED)).toBe(true);
    expect(canEnd(transition(CONNECTED, { type: "CONNECTION_LOST" }))).toBe(true);
    expect(canEnd(INITIAL_CALL_STATE)).toBe(false);
  });
});

describe("error reporting", () => {
  const kinds: CallErrorKind[] = [
    "mic_denied",
    "mic_missing",
    "mic_busy",
    "unsupported_browser",
    "insecure_context",
    "auth_failed",
    "rate_limited",
    "session_create_failed",
    "connect_failed",
    "connection_lost",
    "timed_out",
    "unknown",
  ];

  it("has a distinct, actionable message for every failure kind", () => {
    const messages = kinds.map(errorMessage);
    expect(new Set(messages).size).toBe(kinds.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(20);
      // No error codes or provider jargon in front of a student.
      expect(message).not.toMatch(/error|exception|null|undefined|\b5\d\d\b/i);
    }
  });

  it("tells a blocked student how to unblock themselves", () => {
    expect(errorMessage("mic_denied")).toMatch(/address bar/i);
  });

  it("classifies the browser's media rejections", () => {
    expect(classifyMediaError({ name: "NotAllowedError" })).toBe("mic_denied");
    expect(classifyMediaError({ name: "NotFoundError" })).toBe("mic_missing");
    expect(classifyMediaError({ name: "NotReadableError" })).toBe("mic_busy");
    expect(classifyMediaError(new Error("something else"))).toBe("unknown");
    expect(classifyMediaError(null)).toBe("unknown");
  });
});

describe("statusLabel", () => {
  it("says something for every phase and never contradicts itself", () => {
    const phases: CallState["phase"][] = [
      "idle",
      "requesting_mic",
      "connecting",
      "ready",
      "listening",
      "student_speaking",
      "thinking",
      "tutor_speaking",
      "reconnecting",
      "ending",
      "ended",
      "error",
    ];

    for (const phase of phases) {
      const label = statusLabel({ ...INITIAL_CALL_STATE, phase });
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("prioritises the silent-audio problem over everything else", () => {
    expect(statusLabel(CONNECTED, { needsTapToHear: true })).toMatch(/tap/i);
  });

  // She waits for the student now, so an idle connected call is correct
  // rather than broken -- and the two are indistinguishable unless the
  // screen says which one it is.
  it("tells the student it is their turn before anyone has spoken", () => {
    const label = statusLabel(CONNECTED, { awaitingFirstWord: true });
    expect(label).toMatch(/connected/i);
    expect(label).toMatch(/say hello|tell her/i);
  });

  it("stops saying that once the conversation is under way", () => {
    expect(statusLabel(CONNECTED, { awaitingFirstWord: false })).toBe("Listening");
  });

  it("still reports muted over the invitation to speak", () => {
    const muted = transition(CONNECTED, { type: "TOGGLE_MUTE" });
    expect(statusLabel(muted, { awaitingFirstWord: true })).toMatch(/muted/i);
  });
});
