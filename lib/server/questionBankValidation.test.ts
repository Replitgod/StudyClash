import { describe, expect, it } from "vitest";
import {
  explanationNamesWrongAnswer,
  findDuplicateQuestions,
  isPublishable,
  validateQuestion,
  type QuestionForValidation,
} from "./questionBankValidation";

function question(overrides: Partial<QuestionForValidation> = {}): QuestionForValidation {
  return {
    section: "math",
    domain: "Algebra",
    skill: "Linear equations",
    difficulty: "medium",
    question_type: "multiple_choice",
    question_text: "If 3x + 7 = 22, what is the value of x?",
    answer_choices: '[{"id":"A","text":"3"},{"id":"B","text":"5"},{"id":"C","text":"7"},{"id":"D","text":"9"}]',
    correct_answer: "B",
    explanation: "Subtract 7 from both sides to get 3x = 15, then divide by 3.",
    ...overrides,
  };
}

function codes(input: QuestionForValidation): string[] {
  return validateQuestion(input).map((issue) => issue.code);
}

describe("a well-formed question", () => {
  it("passes with no issues", () => {
    expect(validateQuestion(question())).toEqual([]);
    expect(isPublishable(question())).toBe(true);
  });

  it("accepts choices that arrive already parsed as well as as JSON", () => {
    const parsed = question({
      answer_choices: [
        { id: "A", text: "3" },
        { id: "B", text: "5" },
      ],
      correct_answer: "B",
    });
    expect(validateQuestion(parsed)).toEqual([]);
  });
});

describe("the answer key", () => {
  // The single worst thing in a bank: a question nobody can answer
  // correctly, which reads as a normal question and quietly takes a mark
  // off everyone who sees it.
  it("must name one of the choices", () => {
    expect(codes(question({ correct_answer: "E" }))).toContain("answer_not_among_choices");
  });

  it("must exist at all", () => {
    expect(codes(question({ correct_answer: "" }))).toContain("missing_answer_key");
    expect(codes(question({ correct_answer: null }))).toContain("missing_answer_key");
  });

  it("is matched case-insensitively, since a reviewer may type either", () => {
    expect(validateQuestion(question({ correct_answer: "b" }))).toEqual([]);
  });
});

describe("select-all questions", () => {
  const sata = (overrides: Partial<QuestionForValidation> = {}) =>
    question({
      question_type: "multiple_response",
      question_text: "Which findings require immediate follow-up? Select all that apply.",
      answer_choices:
        '[{"id":"A","text":"Rising temperature"},{"id":"B","text":"Falling output"},{"id":"C","text":"New confusion"},{"id":"D","text":"Stable weight"}]',
      correct_answer: "A,B,C",
      ...overrides,
    });

  it("accepts a key naming several choices", () => {
    expect(validateQuestion(sata())).toEqual([]);
  });

  it("rejects a key naming a choice that does not exist", () => {
    expect(codes(sata({ correct_answer: "A,B,Z" }))).toContain("answer_not_among_choices");
  });

  // The key is compared as a set at grading time, but it is read by humans
  // in the review queue and in exports, so two keys for one answer should
  // be one string.
  it("asks for the key to be stored in a stable order", () => {
    expect(codes(sata({ correct_answer: "C,A,B" }))).toContain("answer_key_not_sorted");
  });
});

describe("answer choices", () => {
  // Two choices that read the same make the question unanswerable however
  // the key is set: a student who picked the other one gave the same answer.
  it("must not repeat the same text", () => {
    expect(
      codes(
        question({
          answer_choices: '[{"id":"A","text":"5"},{"id":"B","text":"5"},{"id":"C","text":"7"}]',
          correct_answer: "A",
        })
      )
    ).toContain("duplicate_choice_text");
  });

  it("treats a difference of whitespace or case as the same text", () => {
    expect(
      codes(
        question({
          answer_choices: '[{"id":"A","text":"Five"},{"id":"B","text":"five "},{"id":"C","text":"7"}]',
          correct_answer: "A",
        })
      )
    ).toContain("duplicate_choice_text");
  });

  it("must not repeat an id", () => {
    expect(
      codes(
        question({
          answer_choices: '[{"id":"A","text":"3"},{"id":"A","text":"5"},{"id":"C","text":"7"}]',
        })
      )
    ).toContain("duplicate_choice_id");
  });

  // A choice with no text renders as a blank button. It caught three real
  // ACT punctuation items whose choices were bare punctuation marks.
  it("must not be blank", () => {
    expect(
      codes(
        question({
          answer_choices: '[{"id":"A","text":"3"},{"id":"B","text":"  "},{"id":"C","text":"7"}]',
        })
      )
    ).toContain("empty_choice_text");
  });

  it("must exist on a multiple-choice question", () => {
    expect(codes(question({ answer_choices: null }))).toContain("missing_choices");
    expect(codes(question({ answer_choices: "not json" }))).toContain("missing_choices");
  });

  it("must not exist on a grid-in", () => {
    expect(
      codes(question({ question_type: "student_produced_response", correct_answer: "5" }))
    ).toContain("unexpected_choices");
  });

  it("needs at least two", () => {
    expect(
      codes(question({ answer_choices: '[{"id":"A","text":"5"}]', correct_answer: "A" }))
    ).toContain("too_few_choices");
  });
});

describe("a grid-in question", () => {
  it("passes with no choices at all", () => {
    expect(
      validateQuestion(
        question({
          question_type: "student_produced_response",
          answer_choices: null,
          correct_answer: "5",
        })
      )
    ).toEqual([]);
  });
});

describe("metadata", () => {
  // Not decoration: the bank picker filters on section and difficulty, and
  // the results breakdown groups on domain and skill. A row missing one is
  // invisible to half the product.
  it("is required on every field the rest of the product reads", () => {
    expect(codes(question({ section: null }))).toContain("missing_metadata");
    expect(codes(question({ domain: "" }))).toContain("missing_metadata");
    expect(codes(question({ skill: "  " }))).toContain("missing_metadata");
    expect(codes(question({ difficulty: null }))).toContain("missing_metadata");
  });
});

describe("an explanation that argues for a different answer", () => {
  it("is caught when it plainly names another choice", () => {
    expect(
      codes(
        question({
          correct_answer: "B",
          explanation: "Choice D is correct because the slope must be negative.",
        })
      )
    ).toContain("explanation_contradicts_key");
  });

  it("is caught in the other phrasings a writer reaches for", () => {
    expect(explanationNamesWrongAnswer("The answer is C.", "B")).toBe("C");
    expect(explanationNamesWrongAnswer("A is the correct choice here.", "B")).toBe("A");
    expect(explanationNamesWrongAnswer("Option D is correct.", "B")).toBe("D");
  });

  // The check has to stay narrow. Explaining why the other options are wrong
  // is exactly the kind of explanation this product wants MORE of, and a
  // looser rule would flag every one of them.
  it("does not fire on an explanation that rules the others out", () => {
    expect(
      validateQuestion(
        question({
          correct_answer: "B",
          explanation:
            "Subtracting 7 gives 3x = 15, so x = 5. Choice A subtracts before dividing incorrectly, C adds 7 instead, and D doubles the result.",
        })
      )
    ).toEqual([]);
  });

  it("does not fire when the explanation names the key itself", () => {
    expect(explanationNamesWrongAnswer("Choice B is correct.", "B")).toBeNull();
  });

  it("does not fire on a grid-in, whose key is not a letter", () => {
    expect(explanationNamesWrongAnswer("The answer is C.", "5")).toBeNull();
  });
});

describe("findDuplicateQuestions", () => {
  // On the Digital SAT the stem is boilerplate and the item is the passage
  // above it. Keying on the stem alone calls a dozen unrelated items
  // duplicates -- which is how a third of the seeded SAT bank was silently
  // discarded on insert.
  it("treats the stimulus as part of the question's identity", () => {
    const found = findDuplicateQuestions([
      { id: "1", stimulus: "The reservoir had grown alarmingly ______.", question_text: "Which choice completes the text?" },
      { id: "2", stimulus: "The violinist's interpretation was ______.", question_text: "Which choice completes the text?" },
    ]);
    expect(found).toEqual([]);
  });

  it("still catches two questions that really are the same", () => {
    const found = findDuplicateQuestions([
      { id: "1", stimulus: "Same passage.", question_text: "Which choice completes the text?" },
      { id: "2", stimulus: "Same passage.", question_text: "Which choice completes the text? " },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].ids).toEqual(["1", "2"]);
  });

  it("ignores punctuation and case differences", () => {
    const found = findDuplicateQuestions([
      { id: "1", question_text: "What is the capital of France?" },
      { id: "2", question_text: "what is the capital of france" },
    ]);
    expect(found).toHaveLength(1);
  });

  it("returns nothing for a bank with no duplicates", () => {
    expect(
      findDuplicateQuestions([
        { id: "1", question_text: "What is 2 + 2?" },
        { id: "2", question_text: "What is 3 + 3?" },
      ])
    ).toEqual([]);
  });
});
