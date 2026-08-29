// The Card Crack protocol, and the Receipts grounding check.
//
// Card Crack is what fires when a student gets something wrong. The brief
// specifies four fields and they are the four worth having:
//
//   misconception   the specific false assumption behind *the option they
//                   picked* -- not a restatement of the right answer
//   underlying_idea the foundational truth, two sentences at most
//   how_to_spot     a heuristic they can actually use in an exam
//   socratic_loop   a micro-question that repairs the node, worth +30 XP
//
// Receipts is the anti-hallucination half: every concept and question
// carries `source_quote`, the verbatim snippet it came from. This module
// verifies that the quote is genuinely present in the source material
// rather than trusting the model's claim -- a fabricated citation is worse
// than no citation, because it converts a wrong answer into a trusted one.

export const RECOVERY_XP = 30;

export type CardCrack = {
  misconception: string;
  underlying_idea: string;
  how_to_spot: string;
  socratic_loop: string;
};

export type GroundedConcept = {
  concept_id: string;
  title: string;
  initial_coordinates: { x: number; y: number };
  source_quote: string;
};

/* ------------------------------------------------------------ normalise */

function squash(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’']/g, "'")
    .replace(/[“”"]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

/** Sentences, counted the way a reader would count them. */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0).length;
}

/* ------------------------------------------------------------- receipts */

/**
 * Verifies a claimed source quote actually appears in the material.
 *
 * Whitespace, quote style and dash style are normalised before comparing,
 * because a model reflowing a PDF line break is not a fabrication. Anything
 * beyond that -- reworded, paraphrased, invented -- fails.
 *
 * A quote that fails is dropped rather than shown. Displaying an unverified
 * "receipt" is strictly worse than showing none: it launders a guess into
 * evidence.
 */
export function verifyQuote(quote: string, sourceMaterial: string): boolean {
  const needle = squash(quote);
  if (needle.length < 12) return false; // Too short to be evidence of anything.
  return squash(sourceMaterial).includes(needle);
}

export type GroundingReport<T> = {
  grounded: T[];
  rejected: Array<{ item: T; reason: string }>;
};

/**
 * Keeps only the concepts whose quotes really appear in the material.
 *
 * Returns the rejections too, so a caller can log how often the model is
 * inventing citations -- a silently-filtered list hides a degrading
 * pipeline until a student notices for you.
 */
export function enforceReceipts<T extends { source_quote?: string }>(
  items: T[],
  sourceMaterial: string
): GroundingReport<T> {
  const grounded: T[] = [];
  const rejected: Array<{ item: T; reason: string }> = [];

  for (const item of items) {
    const quote = clean(item.source_quote, 600);
    if (!quote) {
      rejected.push({ item, reason: "no source_quote" });
      continue;
    }
    if (!verifyQuote(quote, sourceMaterial)) {
      rejected.push({ item, reason: "quote not found in source material" });
      continue;
    }
    grounded.push({ ...item, source_quote: quote });
  }

  return { grounded, rejected };
}

/* ----------------------------------------------------------- card crack */

const MAX_FIELD = 600;
const MAX_UNDERLYING_SENTENCES = 2;

/**
 * Validates and repairs a Card Crack payload.
 *
 * Never returns null. A student who just got something wrong must always be
 * told something useful, so missing fields fall back rather than failing --
 * an error box stacked on top of a wrong answer is the worst possible
 * moment to show one.
 *
 * `underlying_idea` is truncated to two sentences because the brief caps it
 * there and because the cap is the point: the explanation that lands is the
 * short one.
 */
export function buildCardCrack(
  raw: unknown,
  fallback: { topic: string; correctAnswer: string; selectedAnswer: string }
): CardCrack {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const topic = fallback.topic.trim() || "this topic";

  let underlying = clean(source.underlying_idea, MAX_FIELD);
  if (countSentences(underlying) > MAX_UNDERLYING_SENTENCES) {
    const sentences = underlying.match(/[^.!?]+[.!?]+/g) || [underlying];
    underlying = sentences.slice(0, MAX_UNDERLYING_SENTENCES).join(" ").trim();
  }

  return {
    misconception:
      clean(source.misconception, MAX_FIELD) ||
      `You picked "${fallback.selectedAnswer}", which looks right until you check it against the condition the question actually sets.`,
    underlying_idea:
      underlying ||
      `The answer is "${fallback.correctAnswer}". Go back to the core rule behind ${topic} and test each option against it directly.`,
    how_to_spot:
      clean(source.how_to_spot, MAX_FIELD) ||
      `Name the one condition ${topic} turns on before you look at the options. If you cannot name it, that gap is what the question is testing.`,
    socratic_loop:
      clean(source.socratic_loop, MAX_FIELD) ||
      `In your own words: why does "${fallback.correctAnswer}" satisfy the condition where your answer did not?`,
  };
}

/* ------------------------------------------------------ question levels */

export type DifficultyLevel = 1 | 2 | 3;

export const LEVEL_LABELS: Record<DifficultyLevel, string> = {
  1: "Novice",
  2: "Intermediate",
  3: "Mastery",
};

export const LEVEL_FORMATS: Record<DifficultyLevel, string> = {
  1: "multiple_choice",
  2: "fill_in_blank",
  3: "open_response",
};

/**
 * Picks the question level for a concept.
 *
 * Climbs on demonstrated recall rather than on attempts: repetitions come
 * from SM-2 and only increase on a successful review, so a student who
 * keeps failing stays at Level 1 instead of being escalated into
 * open-response questions they cannot yet answer.
 */
export function levelFor(args: {
  repetitions: number;
  masteryPercent: number;
}): DifficultyLevel {
  const reps = Math.max(0, Math.floor(args.repetitions || 0));
  const mastery = Math.max(0, Math.min(100, args.masteryPercent || 0));

  if (reps >= 4 && mastery >= 80) return 3;
  if (reps >= 2 && mastery >= 55) return 2;
  return 1;
}
