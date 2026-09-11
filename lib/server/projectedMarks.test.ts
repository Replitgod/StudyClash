import { describe, expect, it } from "vitest";
import { computeDiagnosticResults, type ResponseForResults } from "@/lib/server/diagnosticBank";
import { parseExamBlueprint } from "@/lib/examBlueprint";

// Raw-marks scoring, for the exams that report arithmetic rather than a band.
//
// JEE Main and NEET do not scale anything: the candidate's result is
// +4 per correct answer and -1 per wrong one, and they read it as "287 out of
// 300". Every other exam in the catalog reports a scaled score, which is why
// the rest of the scorer estimates an ability and maps it onto a range.
//
// The distinction these tests exist to protect is the one the exams
// themselves turn on: a skipped question is not a wrong question. A blank
// scores 0 and a wrong answer scores -1, so an engine that treats the two
// alike overcharges every question a student sensibly left alone.
//
// The five-mark figure people quote is a different comparison -- right
// against wrong, +4 to -1 -- and it is why guessing is still worth it once
// an option can be eliminated. Getting these two gaps mixed up is exactly
// how the folklore "never guess" gets taught, so the tests below pin both.

const JEE_BLUEPRINT = parseExamBlueprint({
  sections: [
    {
      key: "physics",
      label: "Physics",
      modules: [{ module: 1, questions: 25, minutes: 60 }],
      quick: { questions: 10, minutes: 24 },
    },
  ],
  composite: { kind: "none" },
  marking: { correct: 4, incorrect: -1, unattempted: 0, maxMarks: 100 },
});

const SAT_BLUEPRINT = parseExamBlueprint({
  sections: [
    {
      key: "math",
      label: "Math",
      modules: [{ module: 1, questions: 20, minutes: 35 }],
      quick: { questions: 10, minutes: 18 },
      score: { min: 200, max: 800, step: 10 },
    },
  ],
  composite: { kind: "sum" },
});

function response(overrides: Partial<ResponseForResults> = {}): ResponseForResults {
  return {
    question_id: "q",
    selected_answer: "A",
    is_correct: true,
    response_time_seconds: 40,
    flagged: false,
    section: "physics",
    module: 1,
    question: {
      domain: "Kinematics",
      skill: "Projectile motion",
      difficulty: "medium",
      correct_answer: "A",
      explanation: "…",
      question_text: "…",
    },
    ...overrides,
  } as ResponseForResults;
}

const correct = (n: number) => Array.from({ length: n }, () => response());
const wrong = (n: number) =>
  Array.from({ length: n }, () => response({ selected_answer: "B", is_correct: false }));
const skipped = (n: number) =>
  Array.from({ length: n }, () => response({ selected_answer: null, is_correct: false }));

describe("projected marks", () => {
  it("counts the marks the board itself would award", () => {
    // 10 right, 5 wrong: 40 - 5 = 35 on the questions attempted.
    const results = computeDiagnosticResults(
      [...correct(10), ...wrong(5)],
      "quick",
      {},
      JEE_BLUEPRINT
    );

    expect(results.projectedMarks).not.toBeNull();
    expect(results.projectedMarks!.marksOnAttempted).toBe(35);
    expect(results.projectedMarks!.correct).toBe(10);
    expect(results.projectedMarks!.incorrect).toBe(5);
    expect(results.projectedMarks!.attempted).toBe(15);
  });

  it("does not charge a penalty for a question left blank", () => {
    // The rule the whole feature exists for. Same 10 correct in both runs;
    // the second adds five blanks, which under +4/-1 must cost nothing.
    const answeredOnly = computeDiagnosticResults(correct(10), "quick", {}, JEE_BLUEPRINT);
    const withBlanks = computeDiagnosticResults(
      [...correct(10), ...skipped(5)],
      "quick",
      {},
      JEE_BLUEPRINT
    );

    expect(answeredOnly.projectedMarks!.marksOnAttempted).toBe(40);
    expect(withBlanks.projectedMarks!.marksOnAttempted).toBe(40);
    expect(withBlanks.projectedMarks!.incorrect).toBe(0);
  });

  it("prices a wrong answer one mark below a blank, and five below a correct one", () => {
    const blank = computeDiagnosticResults(
      [...correct(10), ...skipped(1)],
      "quick",
      {},
      JEE_BLUEPRINT
    );
    const guessed = computeDiagnosticResults(
      [...correct(10), ...wrong(1)],
      "quick",
      {},
      JEE_BLUEPRINT
    );

    // Blank scores 0, wrong scores -1: the gap is ONE mark. The five-mark
    // gap people quote is between a right answer and a wrong one (+4 to -1),
    // which is a different comparison and the reason guessing is still
    // worth it once you can eliminate an option.
    expect(blank.projectedMarks!.marksOnAttempted - guessed.projectedMarks!.marksOnAttempted).toBe(1);

    const right = computeDiagnosticResults([...correct(11)], "quick", {}, JEE_BLUEPRINT);
    expect(right.projectedMarks!.marksOnAttempted - guessed.projectedMarks!.marksOnAttempted).toBe(5);
  });

  it("reports what the wrong answers actually cost", () => {
    const results = computeDiagnosticResults(
      [...correct(10), ...wrong(5)],
      "quick",
      {},
      JEE_BLUEPRINT
    );
    // Five wrong at -1 each, scaled from 15 attempted up to the 25-question
    // paper: 5 x 1 x (25/15) is about 8.
    expect(results.projectedMarks!.marksLostToNegativeMarking).toBe(8);
  });

  it("projects to the full paper by scaling the same rate", () => {
    // 10 of 10 correct on a 25-question paper projects to 100 of 100.
    const results = computeDiagnosticResults(correct(10), "quick", {}, JEE_BLUEPRINT);
    expect(results.projectedMarks!.projectedFullPaper).toBe(100);
    expect(results.projectedMarks!.maxMarks).toBe(100);
  });

  it("never reports more than the paper is worth", () => {
    const results = computeDiagnosticResults(correct(40), "full", {}, JEE_BLUEPRINT);
    expect(results.projectedMarks!.projectedFullPaper).toBeLessThanOrEqual(100);
  });

  it("floors at zero rather than reporting a negative total", () => {
    const results = computeDiagnosticResults(wrong(20), "quick", {}, JEE_BLUEPRINT);
    expect(results.projectedMarks!.marksOnAttempted).toBe(0);
  });

  it("is null for an exam that reports a scaled score", () => {
    // The SAT has no marking scheme, so there is no arithmetic to report and
    // inventing one would contradict the score the student actually receives.
    const results = computeDiagnosticResults(
      [...correct(8), ...wrong(2)].map((r) => ({ ...r, section: "math" })),
      "quick",
      {},
      SAT_BLUEPRINT
    );
    expect(results.projectedMarks).toBeNull();
    expect(results.estimatedScoreLow).not.toBeNull();
  });

  it("is null when nothing was attempted at all", () => {
    const results = computeDiagnosticResults(skipped(10), "quick", {}, JEE_BLUEPRINT);
    expect(results.projectedMarks).toBeNull();
  });

  it("is withheld on a weak-area retest, which is not a mock paper", () => {
    // A targeted drill on three weak skills is not a sample of the exam, so
    // scaling it to a full-paper mark would be a projection from a
    // deliberately unrepresentative set.
    const results = computeDiagnosticResults(correct(10), "weak_area", {}, JEE_BLUEPRINT);
    expect(results.projectedMarks).toBeNull();
  });
});
