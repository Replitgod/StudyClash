import { describe, expect, it } from "vitest";
import {
  TOOL_NEXT_QUESTION,
  TOOL_NOTE_REQUEST,
  TOOL_RECORD_ANSWER,
  TOOL_SWITCH_TOPIC,
  VOICE_TUTOR_TOOLS,
  liveMastery,
  resolveToolCall,
} from "./tools";
import { createSession } from "./tutorState";
import type { Concept, TutorSession } from "./types";

const CONCEPTS: Concept[] = [
  {
    id: "c1",
    label: "Mitosis",
    facts: ["Q: What is the purpose of mitosis? A: To produce two genetically identical daughter cells"],
    priorWeak: false,
  },
  {
    id: "c2",
    label: "Cellular respiration",
    facts: ["Q: Where does cellular respiration occur? A: In the mitochondria"],
    priorWeak: false,
  },
  {
    id: "c3",
    label: "Osmosis",
    facts: ["Q: What moves during osmosis? A: Water, down its concentration gradient"],
    priorWeak: false,
  },
];

type Move = {
  concept_id: string;
  topic: string;
  material: string[];
  hint_level: string;
  reaction: string;
  guidance: string;
};

const CLOSENESS = /\bso close\b|\bnot quite\b|\balmost\b|\bgood start\b|\bnearly\b|\bright track\b/gi;

/**
 * Does this text tell the tutor to say the student was close?
 *
 * Negation-aware, because the instructions legitimately quote the banned
 * phrases in order to forbid them -- "no 'so close', no 'not quite'". A
 * plain regex flags that prohibition as if it were an endorsement, which
 * would make the guard fire on exactly the text that fixes the bug.
 */
function claimsCloseness(text: string): boolean {
  for (const match of text.matchAll(CLOSENESS)) {
    // A wide-ish window, because a prohibition can list several phrases at
    // once -- "Do not say 'good choice', 'exactly', 'close'" puts the
    // negation a good thirty characters before the last item.
    const before = text.slice(Math.max(0, (match.index ?? 0) - 48), match.index);
    if (!/\b(no|not|never|don't)\b/i.test(before)) return true;
  }
  return false;
}

function moveFrom(output: Record<string, unknown>): Move {
  return output.next as unknown as Move;
}

/** The model asking for something to ask. */
function next(session: TutorSession) {
  return resolveToolCall(session, TOOL_NEXT_QUESTION, {}, 0);
}

/** The model reporting a judged answer. */
function answer(
  session: TutorSession,
  conceptId: string,
  verdict: string,
  misconception?: string
) {
  return resolveToolCall(
    session,
    TOOL_RECORD_ANSWER,
    { concept_id: conceptId, verdict, misconception },
    0
  );
}

describe("tool definitions", () => {
  it("declares exactly the four tools the instructions tell the model to call", () => {
    const names = VOICE_TUTOR_TOOLS.map((tool) => tool.name);
    expect(names).toEqual([
      TOOL_RECORD_ANSWER,
      TOOL_NEXT_QUESTION,
      TOOL_NOTE_REQUEST,
      TOOL_SWITCH_TOPIC,
    ]);
    expect(VOICE_TUTOR_TOOLS.every((tool) => tool.type === "function")).toBe(true);
  });

  it("constrains the verdict to the four the reducer understands", () => {
    const tool = VOICE_TUTOR_TOOLS.find((t) => t.name === TOOL_RECORD_ANSWER)!;
    const params = tool.parameters as {
      properties: { verdict: { enum: string[] } };
    };
    expect(params.properties.verdict.enum).toEqual([
      "correct",
      "partial",
      "incorrect",
      "unknown",
    ]);
  });
});

describe("next_question", () => {
  it("hands back a concept with its source material, never an empty question", () => {
    const result = next(createSession(CONCEPTS));
    const move = moveFrom(result.output);

    expect(move.concept_id).toBe("c1");
    expect(move.topic).toBe("Mitosis");
    expect(move.material.length).toBeGreaterThan(0);
    expect(move.hint_level).toBe("none");
  });

  it("marks the concept as asked, so spacing starts counting", () => {
    const result = next(createSession(CONCEPTS));
    expect(result.session.progress.c1.asked).toBe(1);
    expect(result.session.activeConceptId).toBe("c1");
  });

  // The opening question is baked into the session instructions now, so the
  // model has already asked something before its first tool call. Handing it
  // a second topic would have it ask twice before the student had answered.
  it("does not abandon a question that was asked but never answered", () => {
    const opened = next(createSession(CONCEPTS));
    const again = resolveToolCall(opened.session, TOOL_NEXT_QUESTION, {}, 0);

    expect(moveFrom(again.output).concept_id).toBe("c1");
  });

  it("still moves on once that question has been answered", () => {
    const opened = next(createSession(CONCEPTS));
    const answered = answer(opened.session, "c1", "correct");
    const after = resolveToolCall(answered.session, TOOL_NEXT_QUESTION, {}, 0);

    expect(moveFrom(after.output).concept_id).not.toBe("c1");
  });

  it("still honours an explicit skip of an unanswered question", () => {
    const opened = next(createSession(CONCEPTS));
    const skipped = resolveToolCall(opened.session, TOOL_NOTE_REQUEST, { kind: "skip" }, 0);

    // Skipping is the one case where leaving a question unanswered is what
    // the student actually asked for.
    expect(moveFrom(skipped.output).concept_id).not.toBe("c1");
  });

  it("reports the material as finished rather than inventing a topic", () => {
    let session = createSession([CONCEPTS[0]]);
    // Answer it well enough that it is not owed a revisit, then ask again.
    let step = next(session);
    session = answer(step.session, "c1", "correct").session;
    step = resolveToolCall(session, TOOL_NEXT_QUESTION, {}, 0);

    // Only one concept exists and it was just answered, so there is nothing
    // legitimate left to ask.
    expect(step.output.done).toBe(true);
    expect(step.output).not.toHaveProperty("next");
  });
});

describe("record_answer", () => {
  it("records the verdict and returns the next move in one round trip", () => {
    const opened = next(createSession(CONCEPTS));
    const result = answer(opened.session, "c1", "correct");

    expect(result.session.progress.c1.correct).toBe(1);
    expect(result.session.attempts).toHaveLength(1);
    expect(moveFrom(result.output).concept_id).not.toBe("c1");
  });

  it("keeps the student on the same concept after a miss, with a hint", () => {
    const opened = next(createSession(CONCEPTS));
    const result = answer(opened.session, "c1", "incorrect");
    const move = moveFrom(result.output);

    expect(move.concept_id).toBe("c1");
    expect(move.hint_level).toBe("nudge");
    expect(move.guidance).toMatch(/do NOT give the answer/i);
  });

  it("escalates the guidance rather than repeating the same hint", () => {
    let session = next(createSession(CONCEPTS)).session;
    const levels: string[] = [];

    for (let i = 0; i < 4; i += 1) {
      const result = answer(session, "c1", "incorrect");
      levels.push(moveFrom(result.output).hint_level);
      session = result.session;
    }

    expect(levels).toEqual(["nudge", "concept", "breakdown", "explain"]);
  });

  it("stores a named misconception so the review can quote it", () => {
    const opened = next(createSession(CONCEPTS));
    const result = answer(
      opened.session,
      "c1",
      "incorrect",
      "thinks mitosis halves the chromosome number"
    );

    expect(result.session.progress.c1.misconceptions).toContain(
      "thinks mitosis halves the chromosome number"
    );
  });

  it("recovers rather than corrupting state when the model invents a concept id", () => {
    const opened = next(createSession(CONCEPTS));
    const result = answer(opened.session, "not-a-real-id", "correct");

    // No phantom row, no recorded attempt -- but the call carries on.
    expect(result.session.progress).not.toHaveProperty("not-a-real-id");
    expect(result.session.attempts).toHaveLength(0);
    expect(result.output).toHaveProperty("next");
  });

  it("falls back to a verdict that helps rather than praises", () => {
    const opened = next(createSession(CONCEPTS));
    const result = resolveToolCall(
      opened.session,
      TOOL_RECORD_ANSWER,
      { concept_id: "c1", verdict: "brilliant" },
      0
    );

    // Defaulting to "partial" meant an unreadable verdict became "they got
    // part of it right", and the tutor congratulated a student who had said
    // nothing at all.
    expect(result.session.attempts[0].verdict).toBe("unknown");
    expect(claimsCloseness(moveFrom(result.output).reaction)).toBe(false);
  });
});

// A student sat in silence and got four turns of this:
//
//   "Which one -- thylakoid function -- sound good to start with?"
//   "Oooo, good choice. Okay, what's the thylakoid's main job?"
//   "Yesss -- exactly. But what's the energy molecule...?"
//   "Oof -- close! Think about..."
//
// Three imaginary answers, and the "exactly" would have been recorded as a
// correct answer against a concept the student never spoke about -- landing
// in their mastery estimate and their end-of-session review. The model
// cannot know whether the microphone heard anything. The app can.
describe("an answer nobody gave is never recorded", () => {
  function silentAnswer(verdict: string) {
    const opened = next(createSession(CONCEPTS));
    return resolveToolCall(
      opened.session,
      TOOL_RECORD_ANSWER,
      { concept_id: "c1", verdict },
      0,
      { studentSpokeSinceAsk: false }
    );
  }

  it("refuses to record a verdict when the microphone heard nothing", () => {
    const result = silentAnswer("correct");

    expect(result.session.attempts).toHaveLength(0);
    expect(result.session.progress.c1.correct).toBe(0);
    expect(result.session.progress.c1.asked).toBe(1);
    expect(result.output.recorded).toBe(false);
    expect(result.output.reason).toBe("the_student_has_not_answered");
  });

  it("refuses every verdict, not just the flattering one", () => {
    for (const verdict of ["correct", "partial", "incorrect", "unknown"]) {
      const result = silentAnswer(verdict);
      expect(result.session.attempts).toHaveLength(0);
    }
  });

  it("tells her plainly that nothing was said", () => {
    const result = silentAnswer("correct");
    const reaction = String(result.output.reaction);

    expect(reaction).toMatch(/said NOTHING/i);
    expect(reaction).toMatch(/picked up no speech/i);
    expect(claimsCloseness(reaction)).toBe(false);
    // The exact phrases from the real transcript, banned by name.
    expect(reaction).toMatch(/good choice/i);
    expect(reaction).toMatch(/do not call record_answer/i);
  });

  it("keeps the question on the table rather than moving on", () => {
    const result = silentAnswer("correct");

    expect(result.activeConcept?.id).toBe("c1");
    expect(result.output.topic).toBe("Mitosis");
    expect(result.output.material).toEqual(CONCEPTS[0].facts);
    expect(String(result.output.guidance)).toMatch(/still there|one small hint/i);
  });

  it("cannot inflate the mastery estimate", () => {
    let session = next(createSession(CONCEPTS)).session;
    // Ten imaginary correct answers in a row.
    for (let i = 0; i < 10; i += 1) {
      session = resolveToolCall(
        session,
        TOOL_RECORD_ANSWER,
        { concept_id: "c1", verdict: "correct" },
        0,
        { studentSpokeSinceAsk: false }
      ).session;
    }

    // Nothing was answered, so nothing is known, so the meter stays empty.
    // Being asked a question is not evidence about the person who did not
    // reply to it.
    expect(session.attempts).toHaveLength(0);
    expect(liveMastery(session)).toHaveLength(0);
  });

  it("records normally once the student has actually spoken", () => {
    const opened = next(createSession(CONCEPTS));
    const result = resolveToolCall(
      opened.session,
      TOOL_RECORD_ANSWER,
      { concept_id: "c1", verdict: "correct" },
      0,
      { studentSpokeSinceAsk: true }
    );

    expect(result.session.attempts).toHaveLength(1);
    expect(result.session.progress.c1.correct).toBe(1);
  });

  it("assumes the student spoke when the caller cannot tell", () => {
    // An omitted flag must not silently disable grading.
    const opened = next(createSession(CONCEPTS));
    const result = answer(opened.session, "c1", "correct");
    expect(result.session.attempts).toHaveLength(1);
  });
});

// The bug a student actually heard: they said "I don't know" and were told
// "ooh, so close". Guidance was keyed on the hint ladder alone, so a
// non-answer and a confident wrong answer produced identical instructions.
describe("the reaction matches what was actually said", () => {
  function reactionTo(verdict: string): string {
    const opened = next(createSession(CONCEPTS));
    return moveFrom(answer(opened.session, "c1", verdict).output).reaction;
  }

  it("never tells a student who said 'I don't know' that they were close", () => {
    const reaction = reactionTo("unknown");

    expect(claimsCloseness(reaction)).toBe(false);
    expect(reaction).toMatch(/did not attempt|do not know/i);
    // And it says so explicitly, because the model's instinct is to console.
    expect(reaction).toMatch(/no praise|no 'so close'|no ['"]so close['"]/i);
  });

  it("does not congratulate a wrong answer either", () => {
    const reaction = reactionTo("incorrect");
    expect(reaction).toMatch(/wrong|not there|plainly/i);
    expect(reaction).toMatch(/only say they were close if/i);
  });

  it("allows 'close' for the one verdict where it is true", () => {
    const reaction = reactionTo("partial");
    expect(reaction).toMatch(/part of the right idea/i);
    expect(reaction).toMatch(/only situation you may say it/i);
  });

  it("reacts to a correct answer without re-explaining it", () => {
    const reaction = reactionTo("correct");
    expect(reaction).toMatch(/got it right/i);
    expect(reaction).toMatch(/do NOT explain/i);
  });

  it("gives a different reaction for every verdict", () => {
    const reactions = ["correct", "partial", "incorrect", "unknown"].map(reactionTo);
    expect(new Set(reactions).size).toBe(4);
  });

  it("distinguishes a non-answer from a wrong answer at the same hint rung", () => {
    const opened = next(createSession(CONCEPTS));
    const idk = answer(opened.session, "c1", "unknown");
    const wrong = answer(opened.session, "c1", "incorrect");

    // Same rung of the ladder...
    expect(moveFrom(idk.output).hint_level).toBe(moveFrom(wrong.output).hint_level);
    // ...and deliberately different things to say.
    expect(moveFrom(idk.output).reaction).not.toBe(moveFrom(wrong.output).reaction);
  });

  it("asks only for the missing piece after a half-answer", () => {
    const opened = next(createSession(CONCEPTS));
    const move = moveFrom(answer(opened.session, "c1", "partial").output);

    expect(move.concept_id).toBe("c1");
    expect(move.guidance).toMatch(/ONLY for the piece they missed/i);
    expect(move.guidance).not.toMatch(/different angle/i);
    // And it does not send them back to the start of the question.
    expect(move.guidance).toMatch(/do not re-ask the whole question/i);
  });

  it("has nothing to react to on the opening question", () => {
    const opened = next(createSession(CONCEPTS));
    const move = moveFrom(opened.output);

    expect(move.reaction).toMatch(/first question/i);
    expect(claimsCloseness(move.reaction)).toBe(false);
  });

  it("keeps false encouragement out of the next-question guidance too", () => {
    // The guidance field is about what to ask next; it must not smuggle a
    // reaction back in, which is how the two got tangled in the first place.
    for (const verdict of ["correct", "partial", "incorrect", "unknown"]) {
      const opened = next(createSession(CONCEPTS));
      const move = moveFrom(answer(opened.session, "c1", verdict).output);
      expect(claimsCloseness(move.guidance)).toBe(false);
    }
  });
});

describe("note_request", () => {
  it("does not change the subject when the student asks for a repeat", () => {
    const opened = next(createSession(CONCEPTS));
    const result = resolveToolCall(opened.session, TOOL_NOTE_REQUEST, { kind: "repeat" }, 0);

    expect(result.session.activeConceptId).toBe("c1");
    expect(result.output.topic).toBe("Mitosis");
    expect(String(result.output.guidance)).toMatch(/Do not answer it/i);
  });

  it("explains the current concept rather than moving on", () => {
    const opened = next(createSession(CONCEPTS));
    const result = resolveToolCall(opened.session, TOOL_NOTE_REQUEST, { kind: "explain" }, 0);

    expect(result.output.topic).toBe("Mitosis");
    expect(result.output.material).toEqual(CONCEPTS[0].facts);
  });

  it("moves on when asked to skip, without crediting the skipped concept", () => {
    const opened = next(createSession(CONCEPTS));
    const result = resolveToolCall(opened.session, TOOL_NOTE_REQUEST, { kind: "skip" }, 0);

    expect(moveFrom(result.output).concept_id).not.toBe("c1");
    expect(result.session.progress.c1.correct).toBe(0);
    expect(result.session.progress.c1.state).toBe("unseen");
  });

  it("raises difficulty on request and says so in the response", () => {
    const opened = next(createSession(CONCEPTS));
    const result = resolveToolCall(opened.session, TOOL_NOTE_REQUEST, { kind: "harder" }, 0);

    expect(result.session.difficulty).toBe("hard");
    expect(result.output.difficulty).toBe("hard");
  });
});

describe("unknown tool names", () => {
  it("keeps teaching instead of throwing", () => {
    const result = resolveToolCall(createSession(CONCEPTS), "make_me_a_sandwich", {}, 0);
    expect(result.output).toHaveProperty("next");
  });

  it("survives a null argument payload", () => {
    const result = resolveToolCall(createSession(CONCEPTS), TOOL_RECORD_ANSWER, null, 0);
    expect(result.output).toHaveProperty("next");
  });
});

describe("liveMastery", () => {
  it("shows only concepts that have actually been asked about", () => {
    const opened = next(createSession(CONCEPTS));
    const answered = answer(opened.session, "c1", "correct");

    const rows = liveMastery(answered.session);
    expect(rows.map((row) => row.conceptId)).toContain("c1");
    expect(rows.some((row) => row.conceptId === "c3")).toBe(false);
  });
});

// The scenario the brief names as the bar for "this is tutoring": an
// incomplete answer must not be graded correct, a wrong answer must not be
// resolved for them, and the idea has to come back later to check it stuck.
describe("the real tutor test (Phase 43)", () => {
  it("runs the mitosis conversation the way a tutor would", () => {
    let session = createSession(CONCEPTS);

    // Tutor: "What's the main purpose of mitosis?"
    let step = next(session);
    expect(moveFrom(step.output).topic).toBe("Mitosis");
    session = step.session;

    // Student: "To create cells." -- the right area, not the right answer.
    step = answer(session, "c1", "partial");
    session = step.session;

    // It must NOT be banked as correct, and the tutor must still be here.
    expect(session.progress.c1.correct).toBe(0);
    expect(session.progress.c1.partial).toBe(1);
    expect(moveFrom(step.output).concept_id).toBe("c1");

    // Student: "I don't know."
    step = answer(session, "c1", "unknown");
    session = step.session;
    expect(moveFrom(step.output).hint_level).toBe("nudge");
    expect(moveFrom(step.output).guidance).toMatch(/hint/i);

    // Student answers incorrectly. Guidance gets stronger, still no answer.
    step = answer(session, "c1", "incorrect", "thinks the daughter cells differ from the parent");
    session = step.session;
    expect(moveFrom(step.output).hint_level).toBe("concept");
    expect(moveFrom(step.output).guidance).not.toMatch(/tell them the answer/i);

    // Student finally gets it.
    step = answer(session, "c1", "correct");
    session = step.session;
    expect(session.progress.c1.correct).toBe(1);
    expect(moveFrom(step.output).concept_id).not.toBe("c1");

    // Several questions later, mitosis has to come back around -- retention
    // is the whole point, and a tutor that never re-tests is a quiz.
    const asked: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const move = moveFrom(step.output);
      asked.push(move.concept_id);
      step = answer(step.session, move.concept_id, "correct");
    }

    expect(asked).toContain("c1");

    // And the misconception it named is still on the record for the review.
    expect(step.session.progress.c1.misconceptions).toContain(
      "thinks the daughter cells differ from the parent"
    );
  });
});
