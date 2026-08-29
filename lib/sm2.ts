// SM-2 spaced repetition, plus the visual decay the knowledge map renders.
//
// This is the algorithm the brief specifies, implemented properly rather
// than approximated: SuperMemo-2 as published, with the standard ease
// update, the standard interval ladder, and a reset-on-lapse.
//
// It sits alongside lib/mastery.ts rather than replacing it. They answer
// different questions and both are needed:
//
//   mastery.ts  "how well does this student know it right now?"  -- a
//               continuous 0-100 for ranking what to fix.
//   sm2.ts      "when should it next be shown?"                  -- a
//               discrete schedule, in days.
//
// The bridge between them is `visualDecayAlpha`, which converts the
// schedule into the 0..1 the frontend uses to fade and drift a node.

/** SM-2 grades. 0-2 are failures; 3-5 are recalls of varying quality. */
export type RecallGrade = 0 | 1 | 2 | 3 | 4 | 5;

export type Sm2State = {
  /** Days until the next review. */
  intervalDays: number;
  /** Interval growth multiplier. Never below 1.3 in the original algorithm. */
  easeFactor: number;
  /** Consecutive successful reviews. Resets to 0 on a lapse. */
  repetitions: number;
  /** ms since epoch of the last review, or null if never reviewed. */
  lastReviewedMs: number | null;
};

export const INITIAL_SM2: Sm2State = {
  intervalDays: 0,
  easeFactor: 2.5,
  repetitions: 0,
  lastReviewedMs: null,
};

/** The floor SuperMemo-2 specifies. Below this, intervals stop growing. */
export const MIN_EASE = 1.3;
/** A ceiling of our own: without it a long streak schedules years out. */
export const MAX_EASE = 3.0;
/** Cap the interval so nothing disappears for longer than a school year. */
export const MAX_INTERVAL_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * One SM-2 review.
 *
 * The ease update is the published formula:
 *   EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
 * which leaves a perfect recall (q=5) slightly easier, holds roughly steady
 * at q=4, and penalises progressively below that.
 *
 * A grade below 3 is a lapse: repetitions reset to zero and the card comes
 * back tomorrow. The ease penalty is kept, which is the whole point --
 * a card you keep failing should get *harder* to graduate, not reset clean.
 */
export function reviewSm2(
  state: Sm2State,
  grade: RecallGrade,
  now = Date.now()
): Sm2State {
  const q = clamp(Math.round(grade), 0, 5);

  const previousEase = Number.isFinite(state.easeFactor)
    ? state.easeFactor
    : INITIAL_SM2.easeFactor;

  const easeFactor = clamp(
    previousEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
    MIN_EASE,
    MAX_EASE
  );

  // Lapse.
  if (q < 3) {
    return {
      intervalDays: 1,
      easeFactor,
      repetitions: 0,
      lastReviewedMs: now,
    };
  }

  const repetitions = Math.max(0, Math.floor(state.repetitions || 0)) + 1;

  // The published ladder: 1 day, then 6, then multiply by ease.
  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(Math.max(1, state.intervalDays) * easeFactor);

  return {
    intervalDays: clamp(intervalDays, 1, MAX_INTERVAL_DAYS),
    easeFactor,
    repetitions,
    lastReviewedMs: now,
  };
}

/** ms since epoch when this concept next comes due, or null if unreviewed. */
export function dueAtMs(state: Sm2State): number | null {
  if (state.lastReviewedMs === null) return null;
  return state.lastReviewedMs + state.intervalDays * DAY_MS;
}

export function isDue(state: Sm2State, now = Date.now()): boolean {
  const due = dueAtMs(state);
  // Never reviewed means due now: an unseen concept is the most urgent
  // thing there is, not the least.
  return due === null ? true : due <= now;
}

/**
 * How present a concept should look on the knowledge map, 0..1.
 *
 * 1.0 is bright and snapped to its true orbit; 0.0 is fully faded and
 * drifted out. It is the fraction of the current interval still remaining,
 * so a concept dims steadily across its interval and hits zero exactly when
 * it comes due -- which is what makes the map's decay legible rather than
 * arbitrary.
 *
 * Never-reviewed concepts return 1.0. They have not decayed; they have not
 * started. Rendering them as faded would tell the student they are losing
 * something they never had.
 */
export function visualDecayAlpha(state: Sm2State, now = Date.now()): number {
  if (state.lastReviewedMs === null) return 1;

  const span = Math.max(1, state.intervalDays) * DAY_MS;
  const elapsed = Math.max(0, now - state.lastReviewedMs);
  return clamp(1 - elapsed / span, 0, 1);
}

/**
 * Maps an answer to an SM-2 grade.
 *
 * SM-2 was designed for a human self-rating 0-5, which an app cannot ask
 * for without interrupting every single card. This derives it instead:
 * correctness sets the band, and response time relative to the student's
 * own pace picks within it.
 */
export function gradeFromAnswer(args: {
  isCorrect: boolean;
  responseMs?: number | null;
  /** This student's typical answering time, ms. */
  baselineMs?: number | null;
  /** True when they read the explanation before answering. */
  usedHelp?: boolean;
}): RecallGrade {
  const { isCorrect, responseMs, baselineMs, usedHelp } = args;

  if (!isCorrect) {
    // 2 = "wrong, but the right answer felt familiar"; 1 = slow and wrong,
    // which in SM-2 terms is a heavier lapse.
    if (responseMs && baselineMs && responseMs > baselineMs * 2) return 1;
    return 2;
  }

  // Correct, but only after reading the explanation, is not free recall.
  if (usedHelp) return 3;

  if (!responseMs || !baselineMs || baselineMs <= 0) return 4;

  const ratio = responseMs / baselineMs;
  if (ratio <= 0.75) return 5; // Instant.
  if (ratio <= 1.6) return 4; // Normal.
  return 3; // Correct, but laboured.
}

/** The payload shape the brief specifies for the frontend map. */
export type SpacedRepetitionPayload = {
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  visual_decay_alpha: number;
};

export function toPayload(state: Sm2State, now = Date.now()): SpacedRepetitionPayload {
  return {
    interval_days: state.intervalDays,
    // Two decimals: the brief's baseline is 2.50, and an unrounded float
    // serialises as 2.4999999999999996 after a few reviews.
    ease_factor: Math.round(state.easeFactor * 100) / 100,
    repetitions: state.repetitions,
    visual_decay_alpha: Math.round(visualDecayAlpha(state, now) * 100) / 100,
  };
}
