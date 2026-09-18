import { describe, expect, it } from "vitest";
import {
  applyBlindVerdicts,
  buildBlindSolvePrompt,
  checkGeneratedBatch,
  checkGeneratedQuestion,
  minimumAcceptable,
  normalizeDifficulty,
  numericValue,
  parseBlindVerdicts,
  planTopUp,
  resolveKey,
  stemSimilarity,
  type CheckedQuestion,
  type QuestionShape,
} from "./generatedQuestions";

const MC: QuestionShape = { questionType: "multiple_choice", minChoices: 4, maxChoices: 4 };
const TF: QuestionShape = { questionType: "true_false", minChoices: 2, maxChoices: 2 };

function raw(overrides: Record<string, unknown> = {}) {
  return {
    question_text: "Which organelle releases most of the energy a cell gets from glucose?",
    answer_choices: ["Mitochondrion", "Ribosome", "Golgi apparatus", "Lysosome"],
    correct_answer: "Mitochondrion",
    explanation:
      "Aerobic respiration finishes in the mitochondrion, where the electron transport chain makes most of the ATP.",
    topic: "Cell respiration",
    difficulty: "easy",
    source_excerpt: "",
    ...overrides,
  };
}

function checked(overrides: Partial<CheckedQuestion> = {}): CheckedQuestion {
  return {
    question_text: "What is 6 times 7?",
    answer_choices: ["42", "36", "48", "13"],
    correct_answer: "42",
    explanation: "Six sevens make forty-two.",
    topic: "Arithmetic",
    difficulty: "easy",
    source_excerpt: "",
    choice_feedback: {},
    ...overrides,
  };
}

describe("checkGeneratedQuestion", () => {
  it("accepts a sound question and keeps the model's own difficulty", () => {
    const result = checkGeneratedQuestion(raw({ difficulty: "hard" }), MC);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.question.difficulty).toBe("hard");
  });

  // The old salvage path turned a missing key into choices[0]. The point of
  // this module is that it never guesses.
  it("drops a question whose key is not among its choices instead of guessing one", () => {
    const result = checkGeneratedQuestion(raw({ correct_answer: "Nucleus" }), MC);
    expect(result).toEqual({ ok: false, reason: "the key is not one of the choices" });
  });

  it("never pads a short set of choices with placeholders", () => {
    const result = checkGeneratedQuestion(
      raw({ answer_choices: ["Mitochondrion", "Ribosome", "Lysosome"] }),
      MC
    );
    expect(result.ok).toBe(false);
  });

  it("rejects placeholder choices the model left in", () => {
    const result = checkGeneratedQuestion(
      raw({ answer_choices: ["Mitochondrion", "Ribosome", "Option 3", "Option 4"] }),
      MC
    );
    expect(result).toEqual({ ok: false, reason: "has a placeholder answer choice" });
  });

  it("treats numerically equal choices as duplicates", () => {
    const result = checkGeneratedQuestion(
      raw({
        question_text: "What is the probability of heads on one fair coin toss?",
        answer_choices: ["0.5", "1/2", "0.25", "1"],
        correct_answer: "0.5",
      }),
      MC
    );
    expect(result.ok).toBe(false);
  });

  it("strips labels the model put on its own options and follows the key", () => {
    const result = checkGeneratedQuestion(
      raw({
        answer_choices: ["A) Mitochondrion", "B) Ribosome", "C) Golgi apparatus", "D) Lysosome"],
        correct_answer: "A",
      }),
      MC
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.answer_choices[0]).toBe("Mitochondrion");
      expect(result.question.correct_answer).toBe("Mitochondrion");
    }
  });

  it("rejects a question that points at a passage it does not include", () => {
    const result = checkGeneratedQuestion(
      raw({ question_text: "[Passage A] What is the author's main claim?" }),
      MC
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a short stem that mentions 'the passage'", () => {
    const result = checkGeneratedQuestion(
      raw({ question_text: "According to the passage, what caused the decline?" }),
      MC
    );
    expect(result).toEqual({ ok: false, reason: "mentions a passage but does not include one" });
  });

  it("accepts a stem that carries its own passage", () => {
    const passage =
      "In 1850, most of the town's residents worked in the textile mill on the river. When the mill closed in 1890, the population fell by half within a decade, and the railway that had served the mill was abandoned soon after. ";
    const result = checkGeneratedQuestion(
      raw({
        question_text: `${passage}Which choice best states the main idea of the text?`,
        answer_choices: [
          "The town depended heavily on a single employer.",
          "The railway caused the mill to close.",
          "The population grew after 1890.",
          "The river flooded the mill in 1890.",
        ],
        correct_answer: "The town depended heavily on a single employer.",
      }),
      MC
    );
    expect(result.ok).toBe(true);
  });

  it("rejects figures the student cannot see, but not the graph of a function", () => {
    expect(
      checkGeneratedQuestion(raw({ question_text: "In the figure shown below, what is angle x?" }), MC)
        .ok
    ).toBe(false);
    expect(
      checkGeneratedQuestion(
        raw({
          question_text: "The graph of $y = x^2 - 4$ crosses the x-axis at how many points?",
          answer_choices: ["2", "0", "1", "4"],
          correct_answer: "2",
          explanation: "Setting $y = 0$ gives $x = \\pm 2$, so the graph crosses twice.",
        }),
        MC
      ).ok
    ).toBe(true);
  });

  // Options are shuffled when a deck is saved, so "B is wrong" in an
  // explanation names whatever lands in position B.
  it("rejects an explanation that names an option by letter", () => {
    const result = checkGeneratedQuestion(
      raw({ explanation: "Mitochondria make ATP, so option B is wrong because ribosomes build proteins." }),
      MC
    );
    expect(result).toEqual({
      ok: false,
      reason: "explanation names an option by letter or position",
    });
  });

  it("rejects all-of-the-above, which stops making sense after a shuffle", () => {
    const result = checkGeneratedQuestion(
      raw({ answer_choices: ["Mitochondrion", "Ribosome", "Lysosome", "All of the above"] }),
      MC
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an unclosed math delimiter anywhere", () => {
    const result = checkGeneratedQuestion(raw({ explanation: "Because $x^2 = 4 means x = 2 or -2." }), MC);
    expect(result).toEqual({ ok: false, reason: "has an unclosed $ math delimiter" });
  });

  it("rejects the longest-option-is-the-key giveaway", () => {
    const result = checkGeneratedQuestion(
      raw({
        answer_choices: [
          "The mitochondrion, because the electron transport chain on its inner membrane makes most ATP",
          "Ribosome",
          "Golgi",
          "Lysosome",
        ],
        correct_answer:
          "The mitochondrion, because the electron transport chain on its inner membrane makes most ATP",
      }),
      MC
    );
    expect(result.ok).toBe(false);
  });

  it("keeps why-wrong notes only for real wrong options", () => {
    const result = checkGeneratedQuestion(
      raw({
        choice_feedback: {
          Ribosome: "Ribosomes build proteins; they do not break down glucose.",
          Mitochondrion: "This is the right answer.",
          Nucleus: "Not an option at all.",
        },
      }),
      MC
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.question.choice_feedback)).toEqual(["Ribosome"]);
    }
  });

  it("normalizes true/false keys and ignores whatever choices came back", () => {
    const result = checkGeneratedQuestion(
      raw({ answer_choices: ["yes", "no"], correct_answer: "false" }),
      TF
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.question.answer_choices).toEqual(["True", "False"]);
      expect(result.question.correct_answer).toBe("False");
    }
  });

  it("allows a range of choice counts when the exam uses one", () => {
    const shape: QuestionShape = { questionType: "multiple_choice", minChoices: 4, maxChoices: 5 };
    const five = raw({
      answer_choices: ["Mitochondrion", "Ribosome", "Golgi apparatus", "Lysosome", "Nucleolus"],
    });
    expect(checkGeneratedQuestion(five, shape).ok).toBe(true);
    expect(checkGeneratedQuestion(five, MC).ok).toBe(false);
  });
});

describe("checkGeneratedBatch", () => {
  it("drops near-duplicates, including against questions already accepted", () => {
    const first = raw();
    const reworded = raw({
      question_text: "Which organelle releases most of the energy that a cell gets from glucose?",
    });
    const { accepted, rejected } = checkGeneratedBatch([first, reworded], MC);
    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([{ index: 1, reason: "near-duplicate of another question" }]);

    const topUp = checkGeneratedBatch([reworded], MC, accepted);
    expect(topUp.accepted).toHaveLength(0);
  });

  it("returns an empty result for a non-array", () => {
    expect(checkGeneratedBatch("nope", MC)).toEqual({ accepted: [], rejected: [] });
  });
});

describe("resolveKey", () => {
  it("prefers a choice that literally is the letter over treating it as a position", () => {
    expect(resolveKey(["A", "B", "AB", "O"], "B")).toBe("B");
    expect(resolveKey(["Na", "K", "C", "Ca"], "C")).toBe("C");
  });

  it("maps a bare letter to a position when no choice is that letter", () => {
    expect(resolveKey(["4", "6", "8", "10"], "C")).toBe("8");
  });

  it("matches ignoring case and spacing, snapping to the choice's own text", () => {
    expect(resolveKey(["Photosynthesis", "Respiration"], "  photosynthesis ")).toBe("Photosynthesis");
  });

  it("returns null rather than guessing", () => {
    expect(resolveKey(["4", "6", "8", "10"], "12")).toBeNull();
    expect(resolveKey(["4", "6"], "")).toBeNull();
  });
});

describe("numericValue", () => {
  it("reads decimals, fractions, LaTeX fractions and percentages", () => {
    expect(numericValue("0.5")).toBe(0.5);
    expect(numericValue(".5")).toBe(0.5);
    expect(numericValue("1/2")).toBe(0.5);
    expect(numericValue("$\\frac{1}{2}$")).toBe(0.5);
    expect(numericValue("50%")).toBe(0.5);
    expect(numericValue("−3")).toBe(-3);
  });

  it("returns null for anything that is not just a number", () => {
    expect(numericValue("x = 2")).toBeNull();
    expect(numericValue("2 cm")).toBeNull();
    expect(numericValue("1/0")).toBeNull();
  });
});

describe("blind verification", () => {
  it("parses verdicts defensively", () => {
    expect(
      parseBlindVerdicts({
        results: [
          { index: 0, answer: "42", issue: null },
          { index: "1", answer: "", issue: "  " },
          { index: -1, answer: "x" },
          "junk",
        ],
      })
    ).toEqual([
      { index: 0, answer: "42", issue: null },
      { index: 1, answer: null, issue: null },
    ]);
    expect(parseBlindVerdicts(null)).toEqual([]);
  });

  it("keeps agreement, drops disagreement, issues and no-answer, and keeps unverified items", () => {
    const questions = [checked(), checked(), checked(), checked(), checked()];
    const { kept, dropped } = applyBlindVerdicts(questions, [
      { index: 0, answer: "42", issue: null },
      { index: 1, answer: "48", issue: null },
      { index: 2, answer: "42", issue: "Two options are correct." },
      { index: 3, answer: null, issue: null },
    ]);
    expect(kept).toHaveLength(2);
    expect(dropped.map((d) => d.reason)).toEqual([
      'an independent solve chose "48", not the key "42"',
      "Two options are correct.",
      "an independent solve found no single defensible answer",
    ]);
  });

  it("never shows the verifier the key or the explanation", () => {
    const prompt = buildBlindSolvePrompt({
      notes: "notes",
      questions: [checked({ explanation: "SECRET EXPLANATION", correct_answer: "42" })],
    });
    expect(prompt).not.toContain("SECRET EXPLANATION");
    expect(prompt).not.toMatch(/key|correct_answer/i);
    expect(prompt).toContain("#0");
  });
});

describe("planTopUp", () => {
  it("refills the difficulty bands that came up short, hardest first", () => {
    const accepted = [checked({ difficulty: "easy" }), checked({ difficulty: "easy" })];
    expect(
      planTopUp({ target: 5, accepted, wanted: { easy: 2, medium: 2, hard: 1 } })
    ).toEqual({ easy: 0, medium: 2, hard: 1 });
  });

  it("asks for nothing when the set is already full", () => {
    expect(
      planTopUp({ target: 1, accepted: [checked()], wanted: { easy: 1, medium: 0, hard: 0 } })
    ).toEqual({ easy: 0, medium: 0, hard: 0 });
  });
});

describe("helpers", () => {
  it("normalizes difficulty labels and defaults unknown ones to medium", () => {
    expect(normalizeDifficulty("Hard")).toBe("hard");
    expect(normalizeDifficulty("beginner")).toBe("easy");
    expect(normalizeDifficulty("???")).toBe("medium");
    expect(normalizeDifficulty(undefined)).toBe("medium");
  });

  it("scores rewordings as similar and different questions as not", () => {
    expect(stemSimilarity("What is the capital of France?", "What's the capital city of France?")).toBeGreaterThanOrEqual(0.5);
    expect(stemSimilarity("What is the capital of France?", "How many legs does a spider have?")).toBeLessThan(0.2);
  });

  it("will save a set that is at least 60 percent of what was asked, never fewer than four", () => {
    expect(minimumAcceptable(15)).toBe(9);
    expect(minimumAcceptable(5)).toBe(4);
  });
});
