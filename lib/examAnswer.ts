// Is this answer right?
//
// It used to be `question.correct_answer === body.selectedAnswer`, one
// string equality in the respond route, and that is wrong in two ways that
// both cost a student marks they earned:
//
//   - Grid-ins. The Digital SAT accepts a student-produced response as a
//     decimal or a fraction, so 3/4, 0.75 and .75 are the same answer. An
//     exact string match marks two of the three wrong, and the student has
//     no way to know which spelling the bank happened to store.
//   - Select-all-that-apply, which the NCLEX is built on and which the
//     comparison could not express at all. "A,C" and "C,A" are one answer.
//
// So grading lives here instead: pure, exhaustively tested, and the single
// place any route decides whether a response was correct.

export type GradableQuestionType =
  | "multiple_choice"
  | "multiple_response"
  | "student_produced_response";

/**
 * Tolerance for a numeric grid-in.
 *
 * Relative, not absolute, so it means the same thing for 0.75 and for
 * 750,000. Tight enough that 0.33 is not accepted for 1/3 -- the SAT asks
 * for three decimal places or a fraction, and quietly accepting a rounded
 * answer teaches a habit that loses marks on the real thing.
 */
const RELATIVE_TOLERANCE = 1e-9;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A number, if this string is one.
 *
 * Handles the forms a student actually types into a grid-in: a decimal with
 * or without a leading zero, a signed value, a fraction, and a mixed number
 * written as a fraction. Returns null for anything else, so the caller falls
 * back to comparing text.
 */
export function parseNumericAnswer(raw: string): number | null {
  const clean = raw.trim().replace(/\s+/g, "").replace(/,/g, "");
  if (!clean) return null;

  // Percent signs and currency are not part of a grid-in answer, but
  // students type them. Strip rather than reject: the intent is legible.
  const stripped = clean.replace(/^[$]/, "").replace(/%$/, "");
  if (!stripped) return null;

  const fraction = /^([+-]?\d*\.?\d+)\/(\d*\.?\d+)$/.exec(stripped);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }
    return numerator / denominator;
  }

  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(stripped)) return null;

  const value = Number(stripped);
  return Number.isFinite(value) ? value : null;
}

function numbersMatch(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= RELATIVE_TOLERANCE * scale;
}

/**
 * The choice ids in a select-all answer, as a comparable set.
 *
 * Accepts commas, semicolons, spaces and a JSON array, because the answer
 * key is written by hand in a migration and the student's selection is
 * assembled by a component, and neither should have to know what the other
 * chose.
 */
export function parseChoiceSet(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parts: string[];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      parts = Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [trimmed];
    } catch {
      parts = [trimmed];
    }
  } else {
    parts = trimmed.split(/[,;|\s]+/);
  }

  const seen = new Set<string>();
  for (const part of parts) {
    const id = part.trim().toUpperCase();
    if (id) seen.add(id);
  }

  return [...seen].sort();
}

/**
 * Grade one response.
 *
 * `null` for a response that was never given -- distinct from `false`, which
 * is a wrong answer. The results code counts unanswered questions
 * separately from missed ones, and collapsing the two would report a
 * student who ran out of time as one who got everything wrong.
 */
export function isAnswerCorrect(args: {
  questionType: string;
  /**
   * The key. For a grid-in it may list several acceptable spellings
   * separated by `|` -- "0.75|3/4" -- which is how a question with two
   * genuinely different correct forms is stored.
   */
  correctAnswer: string | null | undefined;
  selected: string | null | undefined;
}): boolean | null {
  const { questionType, correctAnswer, selected } = args;

  if (selected === null || selected === undefined || selected.trim() === "") return null;
  if (!correctAnswer || correctAnswer.trim() === "") return null;

  if (questionType === "multiple_response") {
    const expected = parseChoiceSet(correctAnswer);
    const given = parseChoiceSet(selected);

    // All or nothing, deliberately. A select-all item on the NCLEX is
    // scored as a single decision, and giving partial credit here would
    // report a readiness the real exam would not.
    return (
      expected.length > 0 &&
      expected.length === given.length &&
      expected.every((id, index) => id === given[index])
    );
  }

  // Several acceptable spellings, for a grid-in whose answer can be written
  // more than one genuinely different way.
  const alternatives = correctAnswer.split("|").map((entry) => entry.trim()).filter(Boolean);

  for (const alternative of alternatives) {
    const expectedNumber = parseNumericAnswer(alternative);
    const givenNumber = parseNumericAnswer(selected);

    if (expectedNumber !== null && givenNumber !== null) {
      if (numbersMatch(expectedNumber, givenNumber)) return true;
      continue;
    }

    if (normalizeText(alternative) === normalizeText(selected)) return true;
  }

  return false;
}
