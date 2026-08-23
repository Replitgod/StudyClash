// The AcedIQ mastery engine.
//
// Mastery is NOT `correct / total`. That number cannot tell the difference
// between a topic answered perfectly ten minutes ago and the same topic
// answered perfectly five weeks ago, it treats a lucky 1-for-1 as a 100%,
// and it says the same thing about an easy question and a hard one. Every
// downstream decision in the app -- what to review, what to ask next, how
// hard to make it, what to warn about before an exam -- reads from here, so
// getting it wrong is invisible in the UI and wrong everywhere at once.
//
// The model has four parts:
//
//   strength       what the evidence says they know, once recency,
//                  difficulty and hesitation are accounted for
//   stability      how long that knowledge should survive without practice,
//                  grown by successful spaced repetitions
//   retrievability the odds they could recall it *right now*, decaying from
//                  the last practice against that stability
//   confidence     how much evidence the estimate is standing on
//
// `mastery` is strength discounted by decay and pulled toward a neutral
// prior while confidence is low, so a topic cannot claim 100% off one
// answer and cannot keep claiming it a month later.
//
// Everything here is a pure function of recorded signals. No AI gets a vote
// on what a student knows -- it may explain a number, never set one.

import { type MasteryTier } from "@/lib/masteryTiers";

export type { MasteryTier };

const DAY_MS = 24 * 60 * 60 * 1000;

/* --------------------------------------------------------------- tuning */

// Beta prior on a brand-new topic. 1.5/1.5 is a weak, symmetric prior: it
// costs about three attempts to move the estimate meaningfully, which is
// the same evidence bar MIN_ATTEMPTS_FOR_HIGH_TIER enforces on tiers.
const PRIOR_ALPHA = 1.5;
const PRIOR_BETA = 1.5;

/** Attempts at which confidence reaches one half. */
const CONFIDENCE_HALF_LIFE_ATTEMPTS = 6;

// Weight decay applied per attempt going backwards through recent history.
// 0.82 means an answer eight attempts ago counts about a fifth as much as
// the latest one -- recent evidence dominates without erasing the past.
const RECENCY_DECAY = 0.82;

/** Days of stability a freshly-learned topic starts with. */
const BASE_STABILITY_DAYS = 1.6;

/** Stability ceiling. Nothing is scheduled further out than this. */
const MAX_STABILITY_DAYS = 180;

// Retrievability at which a topic is considered due. 0.85 is the standard
// spaced-repetition target: review just before recall starts to fail, not
// after it already has.
export const REVIEW_THRESHOLD = 0.85;

/** Below this retrievability the student is actively losing the topic. */
const FADING_THRESHOLD = 0.7;

/* -------------------------------------------------------------- signals */

export type AttemptSignal = {
  isCorrect: boolean;
  /** ms since epoch. */
  at: number;
  /** 0 easy .. 1 hard. Unknown difficulty is treated as medium. */
  difficulty?: number | null;
  responseMs?: number | null;
  /** True when the student read the explanation or a hint first. */
  usedHelp?: boolean;
};

export type MasterySignals = {
  /** Cumulative counts. Used when per-attempt history is unavailable. */
  correct: number;
  total: number;
  /** Per-attempt history, oldest first. Sharpens the estimate when present. */
  attempts?: AttemptSignal[];
  /** ms since epoch of the last practice, or null if never practised. */
  lastPracticedMs?: number | null;
  /** Distinct sessions that touched this topic. Drives stability growth. */
  sessions?: number;
  // Times the student missed something and then got a follow-up on the same
  // idea right. Recovery is the strongest evidence of real learning we
  // collect, so it buys stability that a plain correct answer does not.
  recoveries?: number;
  /** Typical response time for this student, ms. The hesitation baseline. */
  baselineResponseMs?: number | null;
  now?: number;
};

export type MasteryState = {
  /** 0-100. What they know right now, decay and confidence included. */
  mastery: number;
  /** 0-100. What the evidence says, before forgetting is applied. */
  strength: number;
  /** 0-1. Odds of recalling it right now. */
  retrievability: number;
  /** 0-1. How much evidence this is standing on. */
  confidence: number;
  /** Days this should survive without practice. */
  stabilityDays: number;
  /** Days until it drops to the review threshold. Negative means overdue. */
  daysUntilDue: number;
  /** ms since epoch when review is due, or null if never practised. */
  dueAtMs: number | null;
  isDue: boolean;
  /** Actively being forgotten right now. */
  isFading: boolean;
  tier: MasteryTier;
  /** True when there is not yet enough evidence to make any claim. */
  isProvisional: boolean;
};

/* ----------------------------------------------------------------- math */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * How much a single attempt counts, and how much of it counts as evidence
 * of knowing rather than guessing.
 *
 * A correct answer on a hard question is worth more than a correct answer
 * on an easy one; a miss on an easy question is worse than a miss on a hard
 * one. Slow-but-correct is real but fragile knowledge, so it scores below
 * fast-and-correct rather than as a miss. Needing the explanation first
 * means the answer does not count as unaided recall.
 */
export function attemptCredit(
  attempt: AttemptSignal,
  baselineResponseMs: number | null | undefined
): { weight: number; credit: number } {
  // Unknown difficulty is medium: neither rewarded nor punished.
  const difficulty = clamp(attempt.difficulty ?? 0.5, 0, 1);

  if (attempt.isCorrect) {
    // 0.85 on the easiest question, 1.15 on the hardest, clamped below.
    let credit = 0.85 + difficulty * 0.3;

    // Hesitation. Only meaningful when we have something to compare to and
    // the answer took materially longer than this student's own norm.
    if (
      baselineResponseMs &&
      baselineResponseMs > 0 &&
      attempt.responseMs &&
      attempt.responseMs > 0
    ) {
      const ratio = attempt.responseMs / baselineResponseMs;
      // Twice their normal pace costs about 12%, and that is the cap.
      if (ratio > 1.3) credit -= Math.min(0.12, (ratio - 1.3) * 0.17);
    }

    // Answering after reading the explanation is not unaided recall.
    if (attempt.usedHelp) credit *= 0.55;

    return { weight: 1, credit: clamp(credit, 0, 1) };
  }

  // A miss on an easy question is stronger evidence of a gap than a miss on
  // the hardest question in the deck, so it carries more weight.
  return { weight: 1.15 - difficulty * 0.3, credit: 0 };
}

/**
 * Recency-weighted, prior-smoothed strength in 0..1.
 *
 * With per-attempt history this is an exponentially-weighted beta posterior
 * mean. Without it, it degrades to a plain smoothed accuracy over the
 * cumulative counts -- close to the number the old model produced, but
 * arrived at through this same code path so the two cannot disagree.
 */
export function computeStrength(signals: MasterySignals): {
  strength: number;
  evidence: number;
} {
  const { attempts, baselineResponseMs } = signals;

  let weightedCredit = 0;
  let weightedTotal = 0;

  if (attempts && attempts.length > 0) {
    const ordered = attempts.slice().sort((a, b) => a.at - b.at);
    const last = ordered.length - 1;

    // Recency weights are normalised so they sum back to the real number of
    // attempts. Without this the weights form a geometric series capped at
    // 1/(1-RECENCY_DECAY) ~= 5.6, the prior never gets outweighed however
    // much a student practises, and mastery silently caps around 82% -- a
    // student who genuinely knows something could never be told so.
    // Recency decides *which* answers matter; it must not decide how much
    // evidence exists.
    const recencies = ordered.map((_, i) => Math.pow(RECENCY_DECAY, last - i));
    const recencySum = recencies.reduce((sum, r) => sum + r, 0);
    const normalise = recencySum > 0 ? ordered.length / recencySum : 1;

    for (let i = 0; i < ordered.length; i += 1) {
      const recency = recencies[i] * normalise;
      const { weight, credit } = attemptCredit(ordered[i], baselineResponseMs);
      weightedTotal += recency * weight;
      weightedCredit += recency * weight * credit;
    }
  } else {
    const total = Math.max(0, signals.total);
    const correct = clamp(signals.correct, 0, total);
    weightedTotal = total;
    weightedCredit = correct;
  }

  const strength =
    (weightedCredit + PRIOR_ALPHA) / (weightedTotal + PRIOR_ALPHA + PRIOR_BETA);

  return { strength: clamp(strength, 0, 1), evidence: weightedTotal };
}

/**
 * How long this should survive without practice.
 *
 * Stability grows sub-linearly with the number of separate sessions that
 * have touched it -- spacing is what builds durable memory, so five
 * sessions across five days beat five in one sitting -- and scales with how
 * well the student actually knows it. Recoveries count as extra
 * repetitions: fixing something you got wrong is the strongest learning
 * signal the app collects.
 */
export function computeStability(args: {
  strength: number;
  sessions: number;
  recoveries: number;
}): number {
  const { strength } = args;
  const sessions = Math.max(0, args.sessions);
  const recoveries = Math.max(0, args.recoveries);

  const repetitions = sessions + recoveries;
  const spacingFactor = Math.pow(1 + repetitions, 0.75);

  // A topic at 40% strength gets barely any stability no matter how often
  // it has been seen; a topic at 95% gets the full multiplier.
  const knowledgeFactor = 0.25 + Math.pow(strength, 1.8) * 2.4;

  return clamp(
    BASE_STABILITY_DAYS * spacingFactor * knowledgeFactor,
    0.5,
    MAX_STABILITY_DAYS
  );
}

/** Ebbinghaus decay: the odds of recall after `elapsedDays` without practice. */
export function computeRetrievability(
  elapsedDays: number,
  stabilityDays: number
): number {
  if (elapsedDays <= 0) return 1;
  if (stabilityDays <= 0) return 0;
  return clamp(Math.exp(-elapsedDays / stabilityDays), 0, 1);
}

/** 0..1, asymptotic in the amount of evidence behind the estimate. */
export function computeConfidence(evidence: number): number {
  const e = Math.max(0, evidence);
  return e / (e + CONFIDENCE_HALF_LIFE_ATTEMPTS);
}

/* ------------------------------------------------------------ the model */

/**
 * The whole model. Given everything recorded about one topic, say what the
 * student knows right now and when it needs to be seen again.
 */
export function computeMastery(signals: MasterySignals): MasteryState {
  const now = signals.now ?? Date.now();
  const { strength, evidence } = computeStrength(signals);
  const confidence = computeConfidence(evidence);

  const sessions = signals.sessions ?? (signals.total > 0 ? 1 : 0);
  const recoveries = signals.recoveries ?? 0;
  const stabilityDays = computeStability({ strength, sessions, recoveries });

  const lastPracticedMs = signals.lastPracticedMs ?? null;
  const hasPractised = lastPracticedMs !== null && lastPracticedMs > 0;
  const elapsedDays = hasPractised
    ? Math.max(0, (now - (lastPracticedMs as number)) / DAY_MS)
    : 0;

  const retrievability = hasPractised
    ? computeRetrievability(elapsedDays, stabilityDays)
    : 1;

  // Decay is applied at partial force. What you have learned does not
  // vanish, it becomes harder to reach -- a topic mastered last month and
  // not seen since is worth well over zero, and telling a student otherwise
  // would make the whole number untrustworthy.
  // Small-sample uncertainty is already handled, correctly, by the beta
  // prior inside computeStrength -- one correct answer out of one lands at
  // 62%, not 100%. Shrinking a second time toward 0.5 here would be double
  // counting, and would stop a well-evidenced topic from ever reporting a
  // high number. `confidence` is reported so the UI can hedge the language;
  // it does not get to move the number twice.
  const reported = strength * (0.55 + 0.45 * retrievability);

  // Days until retrievability decays to the review threshold.
  const fullLifeDays = -Math.log(REVIEW_THRESHOLD) * stabilityDays;
  const daysUntilDue = hasPractised ? fullLifeDays - elapsedDays : 0;
  const dueAtMs = hasPractised
    ? (lastPracticedMs as number) + fullLifeDays * DAY_MS
    : null;

  const mastery = Math.round(clamp(reported, 0, 1) * 100);

  return {
    mastery,
    strength: Math.round(strength * 100),
    retrievability,
    confidence,
    stabilityDays,
    daysUntilDue,
    dueAtMs,
    isDue: hasPractised && retrievability <= REVIEW_THRESHOLD,
    isFading: hasPractised && retrievability < FADING_THRESHOLD,
    tier: tierFor(mastery, evidence),
    isProvisional: evidence < 3,
  };
}

/**
 * The tier shown to the student.
 *
 * Deliberately stricter than the raw number: nothing is called Strong or
 * Mastered until there is enough evidence to support the claim, which is
 * the guarantee lib/masteryTiers.ts was written to make and this preserves.
 */
export function tierFor(mastery: number, evidence: number): MasteryTier {
  if (mastery < 50) return "needs_review";
  if (mastery < 75) return "developing";
  if (evidence < 3) return "developing";
  return mastery >= 88 ? "mastered" : "strong";
}

/**
 * Ordering for "what should I fix first".
 *
 * Not simply "lowest mastery". A topic slipping from 80% is a bigger
 * opportunity than one obscure topic stuck at 20% that was never learned,
 * because it is cheap to save and expensive to lose. And a number we are
 * not confident about is not worth sending a student to act on yet.
 * Higher score = more urgent.
 */
export function opportunityScore(state: MasteryState, weight = 1): number {
  const gap = 1 - state.mastery / 100;
  const decayPressure = state.isFading ? 1.35 : state.isDue ? 1.15 : 1;
  const trust = 0.4 + 0.6 * state.confidence;
  return gap * decayPressure * trust * weight;
}

/**
 * Plain-English summary of why a topic is being surfaced. Every number the
 * app shows a student should be able to explain itself -- "what does this
 * number mean" is one of the five questions the product must never provoke.
 */
export function explainMastery(state: MasteryState): string {
  if (state.isProvisional) {
    return "Not enough practice yet to call this either way.";
  }
  if (state.isFading) {
    return `You knew this at ${state.strength}% — it has been long enough that it is slipping.`;
  }
  if (state.isDue) {
    return "Due for review — this is the moment it sticks best.";
  }
  if (state.tier === "mastered") {
    return `Solid. Next review in about ${Math.max(1, Math.round(state.daysUntilDue))} days.`;
  }
  if (state.tier === "strong") {
    return "Nearly there — one more pass should lock it in.";
  }
  return "Still shaky. Worth a focused session.";
}
