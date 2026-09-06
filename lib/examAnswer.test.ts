import { describe, expect, it } from "vitest";
import { isAnswerCorrect, parseChoiceSet, parseNumericAnswer } from "./examAnswer";

function grade(questionType: string, correctAnswer: string | null, selected: string | null) {
  return isAnswerCorrect({ questionType, correctAnswer, selected });
}

describe("multiple choice", () => {
  it("matches the chosen letter", () => {
    expect(grade("multiple_choice", "B", "B")).toBe(true);
    expect(grade("multiple_choice", "B", "C")).toBe(false);
  });

  it("does not fail a student over whitespace or case", () => {
    expect(grade("multiple_choice", "B", " b ")).toBe(true);
    expect(grade("multiple_choice", " B", "b")).toBe(true);
  });
});

describe("select all that apply", () => {
  // "A,C" and "C,A" are one answer. The old string comparison could not
  // express this at all, which is why the NCLEX's central question type
  // could not be stored.
  it("ignores the order the choices were selected in", () => {
    expect(grade("multiple_response", "A,C,D", "D,A,C")).toBe(true);
    expect(grade("multiple_response", "A,C,D", "A,C,D")).toBe(true);
  });

  it("accepts the separators an answer key and a component each reach for", () => {
    expect(grade("multiple_response", "A,C", "A C")).toBe(true);
    expect(grade("multiple_response", "A;C", "A,C")).toBe(true);
    expect(grade("multiple_response", '["A","C"]', "C,A")).toBe(true);
  });

  // All or nothing, deliberately: a select-all item is scored as one
  // decision, and partial credit here would report a readiness the real
  // exam would not.
  it("fails a partial selection and an over-selection alike", () => {
    expect(grade("multiple_response", "A,C,D", "A,C")).toBe(false);
    expect(grade("multiple_response", "A,C,D", "A,C,D,E")).toBe(false);
    expect(grade("multiple_response", "A,C,D", "B,E")).toBe(false);
  });

  it("is not fooled by a repeated choice", () => {
    expect(grade("multiple_response", "A,C", "A,C,C")).toBe(true);
    expect(grade("multiple_response", "A,C", "A,A")).toBe(false);
  });
});

describe("student-produced responses", () => {
  // The Digital SAT accepts a grid-in as a decimal or a fraction, so all
  // three of these are the same answer. An exact string match marked two of
  // them wrong and gave the student no way to know which spelling the bank
  // happened to store.
  it("treats equal values written differently as the same answer", () => {
    for (const written of ["0.75", ".75", "3/4", "6/8", "0.750"]) {
      expect(grade("student_produced_response", "3/4", written)).toBe(true);
    }
  });

  it("accepts a signed or padded number", () => {
    expect(grade("student_produced_response", "7", "+7")).toBe(true);
    expect(grade("student_produced_response", "7", " 7 ")).toBe(true);
    expect(grade("student_produced_response", "-3", "-3.0")).toBe(true);
  });

  it("strips the units a student types even though the grid has none", () => {
    expect(grade("student_produced_response", "40", "$40")).toBe(true);
    expect(grade("student_produced_response", "25", "25%")).toBe(true);
    expect(grade("student_produced_response", "1200", "1,200")).toBe(true);
  });

  // The SAT asks for three decimal places or a fraction. Quietly accepting
  // a rounded answer teaches a habit that loses marks on the real thing.
  it("does not accept a rounded answer as an exact one", () => {
    expect(grade("student_produced_response", "1/3", "0.33")).toBe(false);
    expect(grade("student_produced_response", "1/3", "0.333")).toBe(false);
  });

  it("still gets ordinary wrong answers wrong", () => {
    expect(grade("student_produced_response", "6", "7")).toBe(false);
    expect(grade("student_produced_response", "3/4", "4/3")).toBe(false);
  });

  it("accepts any of several genuinely different correct forms", () => {
    expect(grade("student_produced_response", "0.75|three quarters", "three quarters")).toBe(true);
    expect(grade("student_produced_response", "0.75|three quarters", "3/4")).toBe(true);
    expect(grade("student_produced_response", "0.75|three quarters", "half")).toBe(false);
  });

  it("compares as text when neither side is a number", () => {
    expect(grade("student_produced_response", "photosynthesis", "Photosynthesis")).toBe(true);
    expect(grade("student_produced_response", "photosynthesis", "respiration")).toBe(false);
  });
});

// null is not false. The results code counts unanswered questions
// separately from missed ones, and collapsing the two reports a student who
// ran out of time as one who got everything wrong.
describe("questions nobody answered", () => {
  it("returns null rather than marking an unanswered question wrong", () => {
    expect(grade("multiple_choice", "B", null)).toBeNull();
    expect(grade("multiple_choice", "B", "")).toBeNull();
    expect(grade("multiple_choice", "B", "   ")).toBeNull();
    expect(grade("multiple_response", "A,C", null)).toBeNull();
  });

  it("returns null when the bank has no answer key to grade against", () => {
    expect(grade("multiple_choice", null, "B")).toBeNull();
    expect(grade("multiple_choice", "", "B")).toBeNull();
  });
});

describe("parseNumericAnswer", () => {
  it("reads the forms a grid-in accepts", () => {
    expect(parseNumericAnswer("0.75")).toBe(0.75);
    expect(parseNumericAnswer(".75")).toBe(0.75);
    expect(parseNumericAnswer("3/4")).toBe(0.75);
    expect(parseNumericAnswer("-2.5")).toBe(-2.5);
    expect(parseNumericAnswer("1,000")).toBe(1000);
  });

  it("returns null for anything that is not a number", () => {
    for (const text of ["", "  ", "abc", "3/", "/4", "3/0", "1.2.3", "--5", "A"]) {
      expect(parseNumericAnswer(text)).toBeNull();
    }
  });
});

describe("parseChoiceSet", () => {
  it("sorts and de-duplicates so two spellings of one answer match", () => {
    expect(parseChoiceSet("C, A, B")).toEqual(["A", "B", "C"]);
    expect(parseChoiceSet("a b a")).toEqual(["A", "B"]);
  });

  it("returns nothing for an empty selection", () => {
    expect(parseChoiceSet("")).toEqual([]);
    expect(parseChoiceSet("   ")).toEqual([]);
  });
});
