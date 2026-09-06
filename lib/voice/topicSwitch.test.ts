import { describe, expect, it } from "vitest";
import {
  TOOL_NOTE_REQUEST,
  TOOL_NEXT_QUESTION,
  TOOL_RECORD_ANSWER,
  TOOL_SWITCH_TOPIC,
  resolveTopicSwitch,
  resolveToolCall,
} from "./tools";
import { createSession } from "./tutorState";
import type { Concept, TutorSession } from "./types";

// Changing the subject in the middle of a call.
//
// Its own file rather than more of tools.test.ts, because a switch is the
// one tool call that is resolved in two halves -- the pure decision here,
// the network fetch in the hook -- and the failures worth guarding are all
// about what survives the seam.

const BIOLOGY: Concept[] = [
  {
    id: "c1",
    label: "Photosynthesis",
    facts: ["Q: Where does it happen? A: In the chloroplast"],
    priorWeak: false,
  },
  {
    id: "c2",
    label: "Osmosis",
    facts: ["Q: What moves? A: Water, down its gradient"],
    priorWeak: false,
  },
];

const ALGEBRA: Concept[] = [
  { id: "c1", label: "Absolute value", facts: ["|x| is distance from zero"], priorWeak: false },
  { id: "c2", label: "Vertex form", facts: ["y = a(x-h)^2 + k"], priorWeak: false },
  { id: "c3", label: "Transformations", facts: ["Adding inside shifts left"], priorWeak: false },
];

type Move = {
  concept_id: string;
  topic: string;
  material: string[];
  hint_level: string;
  reaction: string;
  guidance: string;
};

function moveFrom(output: Record<string, unknown>): Move {
  return output.next as unknown as Move;
}

function next(session: TutorSession) {
  return resolveToolCall(session, TOOL_NEXT_QUESTION, {}, 0);
}

function answer(session: TutorSession, conceptId: string, verdict: string) {
  return resolveToolCall(session, TOOL_RECORD_ANSWER, { concept_id: conceptId, verdict }, 0);
}

function switchTo(session: TutorSession, topic: unknown) {
  return resolveToolCall(session, TOOL_SWITCH_TOPIC, { topic }, 0);
}

describe("asking to switch", () => {
  it("asks the caller to fetch rather than answering from nothing", () => {
    const session = createSession(BIOLOGY, undefined, "Photosynthesis");
    const result = switchTo(session, "let's switch to algebra 2");

    // Normalised on the way through, so the fetch and the shared cache key
    // see the subject and not the sentence it arrived in.
    expect(result.pendingTopicSwitch).toBe("algebra 2");
    // Nothing is sent yet: the caller owes the model exactly one output for
    // this call id, and it is the one resolveTopicSwitch produces.
    expect(result.output).toEqual({});
    expect(result.session).toBe(session);
  });

  it("keeps teaching when there was no subject in what they said", () => {
    const session = createSession(BIOLOGY, undefined, "Photosynthesis");
    const result = switchTo(session, "um");

    expect(result.pendingTopicSwitch).toBeUndefined();
    expect(result.output.switch_failed).toBe(true);
    expect(String(result.output.guidance)).toMatch(/ask them plainly which subject/i);
  });

  // A student saying "let's do photosynthesis" while doing photosynthesis is
  // agreeing with you, not redirecting you. Regenerating the outline would
  // cost a round trip of silence to arrive where the call already is.
  it("treats a switch to the current subject as no switch at all", () => {
    const session = createSession(BIOLOGY, undefined, "Photosynthesis");
    const result = switchTo(session, "actually let's do photosynthesis");

    expect(result.pendingTopicSwitch).toBeUndefined();
    expect(result.output.already_on_topic).toBe("photosynthesis");
    expect(String(result.output.reaction)).toMatch(/do not announce a switch/i);
  });
});

describe("once the new material arrives", () => {
  it("puts the new subject in play and hands back the first move", () => {
    const session = createSession(BIOLOGY, undefined, "Photosynthesis");
    const result = resolveTopicSwitch({ session, topic: "algebra 2", concepts: ALGEBRA });

    expect(result.output.switched_to).toBe("algebra 2");
    expect(ALGEBRA.some((c) => c.label === moveFrom(result.output).topic)).toBe(true);
    expect(result.session.topics).toEqual(["Photosynthesis", "algebra 2"]);
  });

  // The bug this prevents: attempts point at concept ids, and the review
  // resolves those ids back to labels through session.concepts. Replace the
  // list and the first half of a two-subject call reviews as "c1".
  it("keeps the old concepts so the review can still name them", () => {
    const session = createSession(BIOLOGY, undefined, "Photosynthesis");
    const asked = next(session);
    const answered = answer(asked.session, asked.activeConcept!.id, "correct");

    const switched = resolveTopicSwitch({
      session: answered.session,
      topic: "algebra 2",
      concepts: ALGEBRA,
    });

    for (const original of BIOLOGY) {
      expect(switched.session.concepts.some((c) => c.id === original.id)).toBe(true);
    }
    expect(switched.session.attempts).toHaveLength(1);

    const attemptId = switched.session.attempts[0].conceptId;
    expect(switched.session.concepts.find((c) => c.id === attemptId)?.label).toBeTruthy();
  });

  // Both the deck distiller and the outline generator emit positional "c1",
  // "c2". A second "c1" would overwrite the first one's progress, silently
  // moving an answer from one subject to another.
  it("gives incoming concepts ids that cannot collide with the old ones", () => {
    const switched = resolveTopicSwitch({
      session: createSession(BIOLOGY, undefined, "Photosynthesis"),
      topic: "algebra 2",
      concepts: ALGEBRA,
    });

    const ids = switched.session.concepts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(switched.session.progress)).toHaveLength(ids.length);
  });

  // Wandering back into photosynthesis three turns after "switch to algebra"
  // is the failure that makes a tutor feel like it was not listening.
  it("never offers a concept from the subject they left", () => {
    let current = resolveTopicSwitch({
      session: createSession(BIOLOGY, undefined, "Photosynthesis"),
      topic: "algebra 2",
      concepts: ALGEBRA,
    }).session;

    const oldIds = new Set(BIOLOGY.map((c) => c.id));

    for (let turn = 0; turn < 12; turn += 1) {
      const asked = next(current);
      if (!asked.activeConcept) break;
      expect(oldIds.has(asked.activeConcept.id)).toBe(false);
      current = answer(asked.session, asked.activeConcept.id, "correct").session;
    }
  });

  // The subject changed; the student did not. Difficulty and every recorded
  // attempt are facts about them, not about photosynthesis.
  it("carries what it learned about the student across the switch", () => {
    const session = createSession(BIOLOGY, undefined, "Photosynthesis");
    const harder = resolveToolCall(session, TOOL_NOTE_REQUEST, { kind: "harder" }, 0).session;
    const asked = next(harder);
    const answered = answer(asked.session, asked.activeConcept!.id, "incorrect").session;

    const switched = resolveTopicSwitch({
      session: answered,
      topic: "algebra 2",
      concepts: ALGEBRA,
    });

    expect(switched.session.difficulty).toBe(answered.difficulty);
    expect(switched.session.attempts).toEqual(answered.attempts);
    expect(switched.session.requests).toEqual(answered.requests);
  });

  it("teaches rather than quizzes when the call is in learn mode", () => {
    const learning = resolveTopicSwitch({
      session: createSession(BIOLOGY),
      topic: "algebra 2",
      concepts: ALGEBRA,
      mode: "learn",
    });
    expect(moveFrom(learning.output).guidance).toMatch(/teach the first piece/i);

    const quizzing = resolveTopicSwitch({
      session: createSession(BIOLOGY),
      topic: "algebra 2",
      concepts: ALGEBRA,
      mode: "quiz",
    });
    expect(moveFrom(quizzing.output).guidance).toMatch(/ask one open question/i);
  });

  // They changed the subject; they did not answer anything. "Nice one" here
  // is praise for a request, which is the class of bug this tutor has spent
  // the most effort eliminating.
  it("does not react as though an answer had been given", () => {
    const result = resolveTopicSwitch({
      session: createSession(BIOLOGY),
      topic: "algebra 2",
      concepts: ALGEBRA,
    });

    const reaction = moveFrom(result.output).reaction;
    expect(reaction).toMatch(/moved to algebra 2/i);
    expect(reaction).not.toMatch(/so close|not quite|exactly|good (choice|start)/i);
  });
});

describe("when the new material never arrives", () => {
  // A dead line is a worse outcome than an honest "I couldn't". The tutor
  // owes the model an output either way.
  it("says so and carries on with the current subject", () => {
    const session = createSession(BIOLOGY, undefined, "Photosynthesis");
    const asked = next(session);

    const failed = resolveTopicSwitch({
      session: asked.session,
      topic: "quantum gastronomy",
      concepts: [],
    });

    expect(failed.output.switch_failed).toBe(true);
    expect(failed.session.topics).toEqual(["Photosynthesis"]);
    expect(failed.activeConcept?.id).toBe(asked.activeConcept!.id);
    expect(String(failed.output.guidance)).toMatch(/carry on with what you were doing/i);
  });

  it("passes a refusal through in the words it was written in", () => {
    const failed = resolveTopicSwitch({
      session: createSession(BIOLOGY),
      topic: "my neighbour",
      concepts: [],
      refusal: "That one is not really a study topic.",
    });

    expect(failed.output.reaction).toBe("That one is not really a study topic.");
  });

  it("never pretends the switch worked", () => {
    const failed = resolveTopicSwitch({
      session: createSession(BIOLOGY),
      topic: "nonsense",
      concepts: [],
    });

    expect(failed.output.switched_to).toBeUndefined();
    expect(String(failed.output.reaction)).toMatch(/do not pretend it worked/i);
  });
});
