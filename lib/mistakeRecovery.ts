// "Explain my mistake", and the follow-up question that proves it stuck.
//
// Wrong-answer feedback is the single highest-value moment in the product:
// it is the only point where a student is already curious about a specific
// gap in their own knowledge. Telling them "Incorrect. Answer: B." wastes
// it. This models the four things worth saying instead --
//
//   what went wrong      the exact misconception, not a restatement
//   the idea             the concept, simply
//   how to spot it       a heuristic they can use next time
//   try one like this    a new question on the same idea
//
// -- and, critically, validates the follow-up before a student ever sees
// it. A generated question with the answer missing from its own choices, or
// one that is just the original question again, teaches nothing and
// destroys trust in every other question in the deck. Everything here is
// pure so those checks can be tested directly.

export type RecoveryExplanation = {
  /** Why the answer they picked was tempting, and why it is wrong. */
  whatWentWrong: string;
  /** The underlying concept, in plain language. */
  theIdea: string;
  /** A reusable heuristic for spotting this next time. */
  howToRecognize: string;
};

export type FollowUpQuestion = {
  questionText: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
};

export type RecoveryPayload = RecoveryExplanation & {
  /** Null when nothing usable could be generated. Never a broken question. */
  followUp: FollowUpQuestion | null;
};

/* ------------------------------------------------------------ normalising */

function normalise(value: string): string {
  return (
    value
      .toLowerCase()
      // Apostrophes are dropped, not spaced: turning "Ohm's" into "ohm s"
      // splits one word into two tokens and makes two phrasings of the same
      // question look only half as similar as they are.
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Rough textual overlap in 0..1, used to catch a "new" question that is
 * really the old one with two words changed.
 */
export function similarity(a: string, b: string): number {
  const left = new Set(normalise(a).split(" ").filter(Boolean));
  const right = new Set(normalise(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;

  // Jaccard: shared over the size of the union.
  return shared / (left.size + right.size - shared);
}

/**
 * Above this, the follow-up is a near-copy of the original rather than a
 * fresh test of the same idea, so it proves nothing about recovery.
 */
export const MAX_FOLLOW_UP_SIMILARITY = 0.8;

const MAX_QUESTION_CHARS = 600;
const MAX_CHOICE_CHARS = 300;
const MAX_EXPLANATION_CHARS = 800;
const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

/* ------------------------------------------------------------- validation */

/**
 * Turns whatever the model returned into a question that is safe to show,
 * or null.
 *
 * Rejecting is always better than showing a broken question: a student who
 * meets one unanswerable question stops trusting every question after it.
 */
export function validateFollowUp(
  raw: unknown,
  original: { questionText: string; correctAnswer: string }
): FollowUpQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;

  const questionText = cleanText(candidate.questionText, MAX_QUESTION_CHARS);
  if (questionText.length < 10) return null;

  if (!Array.isArray(candidate.choices)) return null;

  // De-duplicate case-insensitively: two choices that differ only in
  // capitalisation give the student a question with two right answers.
  const seen = new Set<string>();
  const choices: string[] = [];
  for (const entry of candidate.choices) {
    const choice = cleanText(entry, MAX_CHOICE_CHARS);
    if (!choice) continue;
    const key = normalise(choice);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    choices.push(choice);
    if (choices.length >= MAX_CHOICES) break;
  }

  if (choices.length < MIN_CHOICES) return null;

  const correctAnswer = cleanText(candidate.correctAnswer, MAX_CHOICE_CHARS);
  if (!correctAnswer) return null;

  // The answer must actually be on the list, and must match exactly one
  // entry. Anything else is a question with no defensible answer.
  const matches = choices.filter((c) => normalise(c) === normalise(correctAnswer));
  if (matches.length !== 1) return null;

  // A "new" question that is really the old one teaches nothing.
  if (similarity(questionText, original.questionText) > MAX_FOLLOW_UP_SIMILARITY) {
    return null;
  }

  return {
    questionText,
    choices,
    // Use the entry from the list, so the string the student clicks is
    // byte-identical to the one that gets compared.
    correctAnswer: matches[0],
    explanation: cleanText(candidate.explanation, MAX_EXPLANATION_CHARS),
  };
}

/**
 * Validates the explanation half. Unlike the follow-up this degrades rather
 * than fails: a student who just got something wrong should always be told
 * something useful, even if the model returned only part of it.
 */
export function buildExplanation(
  raw: unknown,
  fallback: { topic: string; correctAnswer: string; explanation: string | null }
): RecoveryExplanation {
  const candidate =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const whatWentWrong = cleanText(candidate.whatWentWrong, MAX_EXPLANATION_CHARS);
  const theIdea = cleanText(candidate.theIdea, MAX_EXPLANATION_CHARS);
  const howToRecognize = cleanText(candidate.howToRecognize, MAX_EXPLANATION_CHARS);

  const topic = fallback.topic.trim() || "this topic";

  return {
    whatWentWrong:
      whatWentWrong ||
      `The answer is "${fallback.correctAnswer}". The option you picked looks close but does not satisfy the condition the question asks about.`,
    theIdea:
      theIdea ||
      cleanText(fallback.explanation, MAX_EXPLANATION_CHARS) ||
      `Go back to the core rule behind ${topic} and check each option against it directly.`,
    howToRecognize:
      howToRecognize ||
      `Next time, name the one condition ${topic} turns on before you look at the options. If you cannot name it, the question is testing that gap.`,
  };
}

/* ----------------------------------------------------------- recovery math */

export type RecoveryOutcome = "recovered" | "still_wrong" | "skipped";

/**
 * What a follow-up result is worth.
 *
 * Recovering is the strongest learning signal the app collects -- it is
 * direct evidence that an explanation landed, which a first-time correct
 * answer is not. It is deliberately worth more than getting the original
 * right would have been, because that is the behaviour worth encouraging.
 */
export function recoveryCredit(outcome: RecoveryOutcome): {
  recoveries: number;
  xp: number;
} {
  if (outcome === "recovered") return { recoveries: 1, xp: 30 };
  // Attempting and missing still beats skipping: they engaged with it.
  if (outcome === "still_wrong") return { recoveries: 0, xp: 5 };
  return { recoveries: 0, xp: 0 };
}
