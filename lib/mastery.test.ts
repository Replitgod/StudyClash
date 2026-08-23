import { describe, expect, it } from "vitest";
import {
  attemptCredit,
  computeConfidence,
  computeMastery,
  computeRetrievability,
  computeStability,
  computeStrength,
  explainMastery,
  opportunityScore,
  REVIEW_THRESHOLD,
  tierFor,
  type AttemptSignal,
} from "@/lib/mastery";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 23);

function correctAt(daysAgo: number, extra: Partial<AttemptSignal> = {}): AttemptSignal {
  return { isCorrect: true, at: NOW - daysAgo * DAY, ...extra };
}

function missAt(daysAgo: number, extra: Partial<AttemptSignal> = {}): AttemptSignal {
  return { isCorrect: false, at: NOW - daysAgo * DAY, ...extra };
}

describe("attemptCredit", () => {
  it("pays more for a correct answer on a hard question than an easy one", () => {
    const hard = attemptCredit({ isCorrect: true, at: NOW, difficulty: 1 }, null);
    const easy = attemptCredit({ isCorrect: true, at: NOW, difficulty: 0 }, null);
    expect(hard.credit).toBeGreaterThan(easy.credit);
  });

  it("weights a miss on an easy question more heavily than a miss on a hard one", () => {
    const easyMiss = attemptCredit({ isCorrect: false, at: NOW, difficulty: 0 }, null);
    const hardMiss = attemptCredit({ isCorrect: false, at: NOW, difficulty: 1 }, null);
    expect(easyMiss.weight).toBeGreaterThan(hardMiss.weight);
    expect(easyMiss.credit).toBe(0);
    expect(hardMiss.credit).toBe(0);
  });

  it("discounts a correct answer that took far longer than the student's norm", () => {
    const fast = attemptCredit(
      { isCorrect: true, at: NOW, responseMs: 5_000 },
      5_000
    );
    const slow = attemptCredit(
      { isCorrect: true, at: NOW, responseMs: 20_000 },
      5_000
    );
    expect(slow.credit).toBeLessThan(fast.credit);
    // Hesitation is a discount, never a miss.
    expect(slow.credit).toBeGreaterThan(0.5);
  });

  it("does not penalise response time when there is no baseline to compare to", () => {
    const withoutBaseline = attemptCredit(
      { isCorrect: true, at: NOW, responseMs: 90_000 },
      null
    );
    const clean = attemptCredit({ isCorrect: true, at: NOW }, null);
    expect(withoutBaseline.credit).toBe(clean.credit);
  });

  it("treats an answer given after reading the explanation as aided", () => {
    const unaided = attemptCredit({ isCorrect: true, at: NOW }, null);
    const aided = attemptCredit({ isCorrect: true, at: NOW, usedHelp: true }, null);
    expect(aided.credit).toBeLessThan(unaided.credit);
  });
});

describe("computeStrength", () => {
  it("weights recent evidence above old evidence", () => {
    // Same 3-of-6 record, opposite order.
    const improving = computeStrength({
      correct: 3,
      total: 6,
      attempts: [missAt(6), missAt(5), missAt(4), correctAt(3), correctAt(2), correctAt(1)],
    });
    const declining = computeStrength({
      correct: 3,
      total: 6,
      attempts: [correctAt(6), correctAt(5), correctAt(4), missAt(3), missAt(2), missAt(1)],
    });
    expect(improving.strength).toBeGreaterThan(declining.strength);
  });

  it("refuses to report certainty from a single lucky answer", () => {
    const { strength, evidence } = computeStrength({
      correct: 1,
      total: 1,
      attempts: [correctAt(0)],
    });
    expect(evidence).toBeLessThan(3);
    expect(strength).toBeLessThan(0.8);
  });

  it("falls back to smoothed cumulative accuracy with no per-attempt history", () => {
    const { strength } = computeStrength({ correct: 8, total: 10 });
    expect(strength).toBeGreaterThan(0.65);
    expect(strength).toBeLessThan(0.85);
  });

  it("never reports outside 0..1 even on contradictory counts", () => {
    expect(computeStrength({ correct: 50, total: 10 }).strength).toBeLessThanOrEqual(1);
    expect(computeStrength({ correct: -5, total: 10 }).strength).toBeGreaterThanOrEqual(0);
    expect(computeStrength({ correct: 0, total: 0 }).strength).toBeGreaterThan(0);
  });
});

describe("computeStability", () => {
  it("grows with spaced repetitions", () => {
    const once = computeStability({ strength: 0.9, sessions: 1, recoveries: 0 });
    const often = computeStability({ strength: 0.9, sessions: 6, recoveries: 0 });
    expect(often).toBeGreaterThan(once);
  });

  it("grows sub-linearly, so cramming cannot buy unlimited stability", () => {
    const five = computeStability({ strength: 0.9, sessions: 5, recoveries: 0 });
    const twenty = computeStability({ strength: 0.9, sessions: 20, recoveries: 0 });
    expect(twenty).toBeLessThan(five * 4);
  });

  it("counts a recovery as a repetition", () => {
    const plain = computeStability({ strength: 0.8, sessions: 3, recoveries: 0 });
    const recovered = computeStability({ strength: 0.8, sessions: 3, recoveries: 2 });
    expect(recovered).toBeGreaterThan(plain);
  });

  it("gives a barely-known topic almost no stability however often it is seen", () => {
    const weak = computeStability({ strength: 0.3, sessions: 10, recoveries: 0 });
    const strong = computeStability({ strength: 0.95, sessions: 10, recoveries: 0 });
    expect(weak).toBeLessThan(strong / 2);
  });

  it("is bounded", () => {
    const huge = computeStability({ strength: 1, sessions: 10_000, recoveries: 10_000 });
    expect(huge).toBeLessThanOrEqual(180);
    expect(huge).toBeGreaterThan(0);
  });
});

describe("computeRetrievability", () => {
  it("is 1 the moment it is practised and decays from there", () => {
    expect(computeRetrievability(0, 10)).toBe(1);
    expect(computeRetrievability(5, 10)).toBeLessThan(1);
    expect(computeRetrievability(50, 10)).toBeLessThan(computeRetrievability(5, 10));
  });

  it("decays more slowly for a more stable memory", () => {
    expect(computeRetrievability(7, 30)).toBeGreaterThan(computeRetrievability(7, 3));
  });

  it("stays within 0..1", () => {
    expect(computeRetrievability(1_000_000, 1)).toBeGreaterThanOrEqual(0);
    expect(computeRetrievability(-5, 10)).toBeLessThanOrEqual(1);
  });
});

describe("computeConfidence", () => {
  it("rises with evidence and never reaches 1", () => {
    expect(computeConfidence(0)).toBe(0);
    expect(computeConfidence(6)).toBeCloseTo(0.5, 5);
    expect(computeConfidence(1_000)).toBeLessThan(1);
    expect(computeConfidence(50)).toBeGreaterThan(computeConfidence(10));
  });
});

describe("computeMastery", () => {
  it("does not award mastery for one correct answer", () => {
    const state = computeMastery({
      correct: 1,
      total: 1,
      attempts: [correctAt(0)],
      lastPracticedMs: NOW,
      sessions: 1,
      now: NOW,
    });
    expect(state.isProvisional).toBe(true);
    expect(state.tier).not.toBe("mastered");
    expect(state.mastery).toBeLessThan(75);
  });

  it("separates a topic answered perfectly today from the same record five weeks ago", () => {
    const shared = {
      correct: 10,
      total: 10,
      sessions: 3,
      now: NOW,
    };
    const fresh = computeMastery({
      ...shared,
      attempts: Array.from({ length: 10 }, (_, i) => correctAt(i * 0.01)),
      lastPracticedMs: NOW,
    });
    const stale = computeMastery({
      ...shared,
      attempts: Array.from({ length: 10 }, (_, i) => correctAt(35 + i)),
      lastPracticedMs: NOW - 35 * DAY,
    });

    expect(fresh.mastery).toBeGreaterThan(stale.mastery);
    expect(fresh.isDue).toBe(false);
    expect(stale.isDue).toBe(true);
    // Old knowledge is harder to reach, not gone.
    expect(stale.mastery).toBeGreaterThan(30);
  });

  it("marks a topic due once retrievability crosses the review threshold", () => {
    const state = computeMastery({
      correct: 6,
      total: 6,
      attempts: Array.from({ length: 6 }, (_, i) => correctAt(20 + i)),
      lastPracticedMs: NOW - 20 * DAY,
      sessions: 2,
      now: NOW,
    });
    expect(state.retrievability).toBeLessThanOrEqual(REVIEW_THRESHOLD);
    expect(state.isDue).toBe(true);
    expect(state.daysUntilDue).toBeLessThan(0);
  });

  it("never marks a never-practised topic due, and gives it no due date", () => {
    const state = computeMastery({ correct: 0, total: 0, lastPracticedMs: null, now: NOW });
    expect(state.isDue).toBe(false);
    expect(state.isFading).toBe(false);
    expect(state.dueAtMs).toBeNull();
  });

  it("ranks a consistently strong topic above a consistently weak one", () => {
    const strong = computeMastery({
      correct: 9,
      total: 10,
      attempts: [...Array.from({ length: 9 }, (_, i) => correctAt(i * 0.1)), missAt(1)],
      lastPracticedMs: NOW,
      sessions: 4,
      now: NOW,
    });
    const weak = computeMastery({
      correct: 2,
      total: 10,
      attempts: [...Array.from({ length: 8 }, (_, i) => missAt(i * 0.1)), correctAt(1), correctAt(2)],
      lastPracticedMs: NOW,
      sessions: 4,
      now: NOW,
    });
    expect(strong.mastery).toBeGreaterThan(weak.mastery);
    // One miss in ten is Strong, not Mastered -- Mastered is a claim about
    // near-perfect recall and should stay expensive to earn.
    expect(strong.tier).toBe("strong");
    expect(weak.tier).toBe("needs_review");
  });

  it("does let a well-evidenced perfect record reach Mastered", () => {
    const state = computeMastery({
      correct: 12,
      total: 12,
      attempts: Array.from({ length: 12 }, (_, i) => correctAt(i * 0.05)),
      lastPracticedMs: NOW,
      sessions: 4,
      now: NOW,
    });
    expect(state.tier).toBe("mastered");
    expect(state.mastery).toBeGreaterThanOrEqual(88);
  });

  it("does not let recency weighting cap how high mastery can go", () => {
    // Regression: geometric recency weights used to cap the effective
    // sample near 5.6, so the prior was never outweighed and mastery could
    // not exceed ~82% however much a student practised.
    const state = computeMastery({
      correct: 40,
      total: 40,
      attempts: Array.from({ length: 40 }, (_, i) => correctAt(i * 0.02)),
      lastPracticedMs: NOW,
      sessions: 8,
      now: NOW,
    });
    expect(state.mastery).toBeGreaterThan(90);
  });

  it("keeps every reported field inside its documented range", () => {
    const cases = [
      { correct: 0, total: 0 },
      { correct: 0, total: 20 },
      { correct: 20, total: 20 },
      { correct: 3, total: 7 },
    ];
    for (const base of cases) {
      const state = computeMastery({ ...base, lastPracticedMs: NOW - 3 * DAY, now: NOW });
      expect(state.mastery).toBeGreaterThanOrEqual(0);
      expect(state.mastery).toBeLessThanOrEqual(100);
      expect(state.retrievability).toBeGreaterThanOrEqual(0);
      expect(state.retrievability).toBeLessThanOrEqual(1);
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThan(1);
      expect(Number.isFinite(state.stabilityDays)).toBe(true);
    }
  });
});

describe("tierFor", () => {
  it("caps a high score at Developing until there is enough evidence", () => {
    expect(tierFor(95, 1)).toBe("developing");
    expect(tierFor(95, 10)).toBe("mastered");
  });

  it("does not need evidence to call something weak", () => {
    expect(tierFor(20, 1)).toBe("needs_review");
  });
});

describe("opportunityScore", () => {
  it("ranks a fading strong topic above an equally-scored stable one", () => {
    const base = computeMastery({
      correct: 8,
      total: 10,
      lastPracticedMs: NOW,
      sessions: 3,
      now: NOW,
    });
    const fading = { ...base, isFading: true };
    expect(opportunityScore(fading)).toBeGreaterThan(opportunityScore(base));
  });

  it("discounts topics the model is not confident about", () => {
    const thin = computeMastery({ correct: 0, total: 1, lastPracticedMs: NOW, now: NOW });
    const solid = computeMastery({ correct: 2, total: 20, lastPracticedMs: NOW, now: NOW });
    // Both are weak, but only one is backed by evidence worth acting on.
    expect(opportunityScore(solid)).toBeGreaterThan(opportunityScore(thin));
  });
});

describe("explainMastery", () => {
  it("always returns something a student can read", () => {
    const states = [
      computeMastery({ correct: 0, total: 0, now: NOW }),
      computeMastery({ correct: 10, total: 10, lastPracticedMs: NOW, sessions: 5, now: NOW }),
      computeMastery({
        correct: 10,
        total: 10,
        lastPracticedMs: NOW - 60 * DAY,
        sessions: 5,
        now: NOW,
      }),
      computeMastery({ correct: 1, total: 9, lastPracticedMs: NOW, sessions: 2, now: NOW }),
    ];
    for (const state of states) {
      const text = explainMastery(state);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/undefined|NaN/);
    }
  });
});
