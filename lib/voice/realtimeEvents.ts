import type { CallEvent, CallPhase } from "./sessionMachine";

// What to do about one event from the realtime server.
//
// This exists as its own module for one reason: the two behaviors most
// likely to be wrong in a voice tutor -- cutting the tutor off the instant
// the student talks, and never answering the same utterance twice -- were
// otherwise buried inside a data-channel message handler, where the only way
// to exercise them is to have a conversation out loud and listen carefully.
// That is not a test, and both bugs are the kind you only hear once a real
// student is on the call.
//
// Pulled out here they are a pure function of (event type, current phase,
// how many tool outputs are pending), which is small enough to enumerate.

export type EventPlan = {
  /** State machine event, if this server event means a phase change. */
  transition: CallEvent | null;
  /** Stop the model generating. Only meaningful while a response is live. */
  cancelResponse: boolean;
  /**
   * Flush audio already sitting in the browser's jitter buffer.
   *
   * Cancelling server-side stops new audio being produced; it does nothing
   * about what has already been sent down the wire. On WebRTC that is the
   * difference between the tutor stopping mid-word and the student hearing
   * another second and a half of a sentence nobody is listening to any more.
   */
  clearAudioBuffer: boolean;
  /** Ask for a spoken turn. Exactly one per response, ever. */
  createResponse: boolean;
};

const NOTHING: EventPlan = {
  transition: null,
  cancelResponse: false,
  clearAudioBuffer: false,
  createResponse: false,
};

/** Phases in which the tutor has audio out, or is about to. */
function tutorHasFloor(phase: CallPhase): boolean {
  return phase === "tutor_speaking" || phase === "thinking";
}

export function planForEvent(args: {
  type: string;
  phase: CallPhase;
  /** Tool outputs submitted during the response that is now finishing. */
  pendingToolOutputs: number;
}): EventPlan {
  const { type, phase, pendingToolOutputs } = args;

  switch (type) {
    case "input_audio_buffer.speech_started":
      return {
        transition: { type: "STUDENT_SPEECH_STARTED" },
        // Only when there is something to cancel. Sending response.cancel
        // with no response in flight makes the server return an error event
        // -- harmless, but it buries the real errors in noise.
        cancelResponse: tutorHasFloor(phase),
        clearAudioBuffer: tutorHasFloor(phase),
        createResponse: false,
      };

    case "input_audio_buffer.speech_stopped":
      return { ...NOTHING, transition: { type: "STUDENT_SPEECH_STOPPED" } };

    case "response.created":
      return { ...NOTHING, transition: { type: "RESPONSE_STARTED" } };

    case "output_audio_buffer.started":
      return { ...NOTHING, transition: { type: "AUDIO_STARTED" } };

    case "output_audio_buffer.stopped":
      return { ...NOTHING, transition: { type: "RESPONSE_DONE" } };

    case "response.done":
      // The response that just ended called tools, so the model is waiting
      // on their output before it can say anything. Ask for the spoken turn
      // -- ONCE, however many tools it called. Asking per tool call is
      // precisely how a tutor ends up answering the same utterance twice.
      if (pendingToolOutputs > 0) {
        return {
          ...NOTHING,
          // ...unless the student is already talking again. Voice activity
          // detection will create its own response when they stop, and two
          // responses in flight talk over each other.
          createResponse: phase !== "student_speaking",
        };
      }
      return { ...NOTHING, transition: { type: "RESPONSE_DONE" } };

    default:
      return NOTHING;
  }
}
