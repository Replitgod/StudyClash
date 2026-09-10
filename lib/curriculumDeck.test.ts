import { describe, expect, it } from "vitest";
import {
  buildExplanation,
  convertCurriculumQuestions,
  mapDifficulty,
  normalizeChoices,
  summarizeSkips,
  type CurriculumQuestionRow,
} from "@/lib/curriculumDeck";

function question(overrides: Partial<CurriculumQuestionRow> = {}): CurriculumQuestionRow {
  return {
    id: "q1",
    concept_id: "c1",
    question_text: "Which molecule carries energy to the Calvin cycle?",
    question_type: "multiple_choice",
    choices: [
      { text: "ATP", isCorrect: true },
      { text: "DNA", isCorrect: false },
      { text: "Glucose", isCorrect: false },
      { text: "Chlorophyll", isCorrect: false },
    ],
    correct_answer: "ATP",
    explanation: "ATP supplies the chemical energy the Calvin cycle spends fixing carbon.",
    difficulty: 3,
    common_mistake: null,
    status: "approved",
    ...overrides,
  };
}

const CONCEPTS = new Map([["c1", "Calvin Cycle"]]);

function convert(rows: CurriculumQuestionRow[]) {
  return convertCurriculumQuestions({
    questions: rows,
    conceptNames: CONCEPTS,
    excerpts: new Map(),
    fallbackTopic: "Photosynthesis",
  });
}

describe("mapDifficulty", () => {
  it("maps the 1-5 curriculum scale onto the deck words", () => {
    expect(mapDifficulty(1)).toBe("easy");
    expect(mapDifficulty(2)).toBe("easy");
    expect(mapDifficulty(3)).toBe("medium");
    expect(mapDifficulty(4)).toBe("hard");
    expect(mapDifficulty(5)).toBe("hard");
  });

  it("falls back to medium rather than throwing on a missing value", () => {
    expect(mapDifficulty(null)).toBe("medium");
    expect(mapDifficulty(undefined)).toBe("medium");
    expect(mapDifficulty(Number.NaN)).toBe("medium");
  });
});

describe("normalizeChoices", () => {
  it("reads the {text,isCorrect} shape the generator writes", () => {
    expect(normalizeChoices([{ text: "A" }, { text: "B" }])).toEqual(["A", "B"]);
  });

  it("accepts plain strings too", () => {
    expect(normalizeChoices(["A", "B"])).toEqual(["A", "B"]);
  });

  it("parses a JSON string, since jsonb can arrive either way", () => {
    expect(normalizeChoices('[{"text":"A"},{"text":"B"}]')).toEqual(["A", "B"]);
  });

  it("returns nothing it cannot read, rather than a half-built option list", () => {
    expect(normalizeChoices(null)).toEqual([]);
    expect(normalizeChoices("not json")).toEqual([]);
    expect(normalizeChoices([{ notText: 1 }, ""])).toEqual([]);
  });
});

describe("buildExplanation", () => {
  it("appends the common mistake, which has nowhere else to go", () => {
    const text = buildExplanation("ATP powers carbon fixation.", "Confusing ATP with NADPH");
    expect(text).toContain("ATP powers carbon fixation.");
    expect(text).toContain("Watch out: Confusing ATP with NADPH");
  });

  it("does not repeat a point the explanation already makes", () => {
    const explanation = "Students often end up confusing ATP with NADPH here.";
    expect(buildExplanation(explanation, "confusing ATP with NADPH")).toBe(explanation);
  });

  it("still says something useful when only the mistake exists", () => {
    expect(buildExplanation("", "Reversing the reactants")).toBe("Watch out: Reversing the reactants");
  });
});

describe("convertCurriculumQuestions", () => {
  it("converts a verified multiple-choice question into a studyable card", () => {
    const { cards, skipped } = convert([question()]);

    expect(skipped).toEqual([]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      question_text: "Which molecule carries energy to the Calvin cycle?",
      answer_choices: ["ATP", "DNA", "Glucose", "Chlorophyll"],
      correct_answer: "ATP",
      difficulty: "medium",
      question_type: "multiple_choice",
      source_curriculum_question_id: "q1",
    });
  });

  it("uses the concept name as the topic, because mastery groups by topic", () => {
    // A card with no usable topic can never surface as a weak area, so this
    // is the field that decides whether uploaded material participates in
    // weak-topic detection at all.
    const { cards } = convert([question()]);
    expect(cards[0].topic).toBe("Calvin Cycle");
  });

  it("falls back to the course name when the concept is unknown", () => {
    const { cards } = convert([question({ concept_id: null })]);
    expect(cards[0].topic).toBe("Photosynthesis");
  });

  it("refuses a card whose correct answer is not one of its options", () => {
    // The failure this module exists to prevent. The study flow compares the
    // student's selection to correct_answer by value: a mismatch marks every
    // attempt wrong, pushes the topic's mastery down, and schedules more
    // review of a concept the student may know perfectly well.
    const { cards, skipped } = convert([question({ correct_answer: "NADPH" })]);

    expect(cards).toEqual([]);
    expect(skipped).toEqual([{ id: "q1", reason: "answer_not_among_choices" }]);
  });

  it("keeps unverified questions out of the review schedule", () => {
    const { cards, skipped } = convert([question({ status: "pending_verification" })]);
    expect(cards).toEqual([]);
    expect(skipped[0].reason).toBe("not_approved");
  });

  it("skips free-response types instead of inventing a rubric to grade them", () => {
    const { cards, skipped } = convert([question({ question_type: "short_answer" })]);
    expect(cards).toEqual([]);
    expect(skipped[0].reason).toBe("unsupported_type");
  });

  it("rejects duplicate options, which make a question unanswerable", () => {
    const rows = [
      question({
        choices: [{ text: "ATP" }, { text: "ATP" }, { text: "DNA" }],
      }),
    ];
    expect(convert(rows).skipped[0].reason).toBe("duplicate_choices");
  });

  it("rejects a question with too few options to be a choice at all", () => {
    const { skipped } = convert([question({ choices: [{ text: "ATP" }] })]);
    expect(skipped[0].reason).toBe("too_few_choices");
  });

  it("converts what it can and reports the rest rather than failing the batch", () => {
    const { cards, skipped } = convert([
      question({ id: "ok" }),
      question({ id: "bad", correct_answer: "Nowhere" }),
      question({ id: "unverified", status: "draft" }),
    ]);

    expect(cards.map((c) => c.source_curriculum_question_id)).toEqual(["ok"]);
    expect(summarizeSkips(skipped)).toMatchObject({
      answer_not_among_choices: 1,
      not_approved: 1,
    });
  });
});
