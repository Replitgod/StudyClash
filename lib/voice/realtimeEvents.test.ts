import { describe, expect, it } from "vitest";
import { planForEvent } from "./realtimeEvents";
import { transition, type CallPhase, type CallState } from "./sessionMachine";

function plan(type: string, phase: CallPhase, pendingToolOutputs = 0) {
  return planForEvent({ type, phase, pendingToolOutputs });
}

describe("barge-in (Phase 4)", () => {
  it("cuts the tutor off the instant the student speaks over her", () => {
    const result = plan("input_audio_buffer.speech_started", "tutor_speaking");

    expect(result.cancelResponse).toBe(true);
    // Cancelling alone is not enough: audio already in the browser's buffer
    // keeps playing, which is the "several seconds of overlapping audio" the
    // brief forbids.
    expect(result.clearAudioBuffer).toBe(true);
    expect(result.transition).toEqual({ type: "STUDENT_SPEECH_STARTED" });
  });

  it("also cuts in during the gap before she is audible", () => {
    const result = plan("input_audio_buffer.speech_started", "thinking");
    expect(result.cancelResponse).toBe(true);
    expect(result.clearAudioBuffer).toBe(true);
  });

  it("does not cancel a response that does not exist", () => {
    // Interrupting silence is just... talking. Sending response.cancel here
    // makes the server return an error event, which buries the real ones.
    const result = plan("input_audio_buffer.speech_started", "listening");
    expect(result.cancelResponse).toBe(false);
    expect(result.clearAudioBuffer).toBe(false);
    expect(result.transition).toEqual({ type: "STUDENT_SPEECH_STARTED" });
  });

  it("handles interruption right at the start of her turn", () => {
    const result = plan("input_audio_buffer.speech_started", "tutor_speaking");
    expect(result.clearAudioBuffer).toBe(true);
  });

  it("survives repeated interruptions without asking for extra responses", () => {
    for (let i = 0; i < 20; i += 1) {
      const result = plan("input_audio_buffer.speech_started", "tutor_speaking");
      expect(result.createResponse).toBe(false);
    }
  });
});

describe("no duplicate responses (Phase 32)", () => {
  it("asks for exactly one spoken turn however many tools the response called", () => {
    for (const toolCount of [1, 2, 3, 8]) {
      const result = plan("response.done", "thinking", toolCount);
      expect(result.createResponse).toBe(true);
    }
  });

  it("does not ask for a turn when no tool was called", () => {
    // The model already spoke. Asking again is a second answer to the same
    // utterance.
    const result = plan("response.done", "tutor_speaking", 0);
    expect(result.createResponse).toBe(false);
    expect(result.transition).toEqual({ type: "RESPONSE_DONE" });
  });

  it("stays quiet when the student has already started talking again", () => {
    // Voice activity detection will create its own response when they stop.
    // Creating one here means two in flight, talking over each other.
    const result = plan("response.done", "student_speaking", 2);
    expect(result.createResponse).toBe(false);
  });

  it("does not double-transition a tool response back to listening", () => {
    // The turn is not over -- the model still has to speak. Moving to
    // listening here shows "Listening" while she is about to talk.
    const result = plan("response.done", "thinking", 1);
    expect(result.transition).toBeNull();
  });
});

describe("the ordinary turn", () => {
  it("maps each server event to exactly one phase change", () => {
    expect(plan("response.created", "listening").transition).toEqual({
      type: "RESPONSE_STARTED",
    });
    expect(plan("output_audio_buffer.started", "thinking").transition).toEqual({
      type: "AUDIO_STARTED",
    });
    expect(plan("output_audio_buffer.stopped", "tutor_speaking").transition).toEqual({
      type: "RESPONSE_DONE",
    });
    expect(plan("input_audio_buffer.speech_stopped", "student_speaking").transition).toEqual({
      type: "STUDENT_SPEECH_STOPPED",
    });
  });

  it("ignores events it has no opinion about", () => {
    for (const type of [
      "session.created",
      "conversation.item.created",
      "response.output_audio.delta",
      "rate_limits.updated",
      "",
    ]) {
      expect(plan(type, "listening")).toEqual({
        transition: null,
        cancelResponse: false,
        clearAudioBuffer: false,
        createResponse: false,
      });
    }
  });
});

// Driving the planner and the state machine together, which is how they run
// in the hook -- a plan that is individually correct can still produce a
// nonsense phase once fed through the reducer.
describe("planner and state machine together", () => {
  function drive(state: CallState, types: string[], toolOutputs: Record<number, number> = {}) {
    let current = state;
    types.forEach((type, index) => {
      const result = planForEvent({
        type,
        phase: current.phase,
        pendingToolOutputs: toolOutputs[index] ?? 0,
      });
      if (result.transition) current = transition(current, result.transition);
    });
    return current;
  }

  const LIVE: CallState = {
    phase: "listening",
    muted: false,
    errorKind: null,
    reconnectAttempts: 0,
    hadConversation: false,
  };

  it("runs a full answer-and-reply turn back to listening", () => {
    const end = drive(LIVE, [
      "input_audio_buffer.speech_started",
      "input_audio_buffer.speech_stopped",
      "response.created",
      "output_audio_buffer.started",
      "output_audio_buffer.stopped",
    ]);

    expect(end.phase).toBe("listening");
    expect(end.hadConversation).toBe(true);
  });

  it("runs a tool round-trip without the UI flickering back to listening", () => {
    const end = drive(
      LIVE,
      [
        "input_audio_buffer.speech_started",
        "input_audio_buffer.speech_stopped",
        "response.created",
        // The response was nothing but a record_answer call.
        "response.done",
      ],
      { 3: 1 }
    );

    // Still thinking, because the spoken turn has been requested and has not
    // arrived yet. Showing "Listening" here invites the student to talk over
    // the answer they just asked for.
    expect(end.phase).toBe("thinking");
  });

  it("leaves the student holding the floor after they cut her off", () => {
    const end = drive(LIVE, [
      "response.created",
      "output_audio_buffer.started",
      "input_audio_buffer.speech_started",
      // The cancelled response reports done a moment later.
      "response.done",
    ]);

    expect(end.phase).toBe("student_speaking");
  });

  it("never lands in a phase outside the machine's vocabulary", () => {
    const types = [
      "input_audio_buffer.speech_started",
      "input_audio_buffer.speech_stopped",
      "response.created",
      "output_audio_buffer.started",
      "output_audio_buffer.stopped",
      "response.done",
    ];

    const valid = new Set<CallPhase>([
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
    ]);

    // Every ordering of the six events, twice over, from a live call.
    let state = LIVE;
    for (let i = 0; i < 200; i += 1) {
      const type = types[(i * 7) % types.length];
      const result = planForEvent({
        type,
        phase: state.phase,
        pendingToolOutputs: i % 3,
      });
      if (result.transition) state = transition(state, result.transition);
      expect(valid.has(state.phase)).toBe(true);
    }
  });
});
