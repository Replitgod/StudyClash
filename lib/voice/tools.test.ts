import { describe, expect, it } from "vitest";
import {
  TOOL_NEXT_QUESTION,
  TOOL_NOTE_REQUEST,
  TOOL_RECORD_ANSWER,
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
  guidance: string;
};

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
  it("declares exactly the three tools the instructions tell the model to call", () => {
    const names = VOICE_TUTOR_TOOLS.map((tool) => tool.name);
    expect(names).toEqual([TOOL_RECORD_ANSWER, TOOL_NEXT_QUESTION, TOOL_NOTE_REQUEST]);
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

  it("falls back to a sane verdict when the model sends nonsense", () => {
    const opened = next(createSession(CONCEPTS));
    const result = resolveToolCall(
      opened.session,
      TOOL_RECORD_ANSWER,
      { concept_id: "c1", verdict: "brilliant" },
      0
    );

    expect(result.session.attempts[0].verdict).toBe("partial");
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
