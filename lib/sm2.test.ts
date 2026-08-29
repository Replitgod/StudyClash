import { describe, expect, it } from "vitest";
import {
  dueAtMs,
  gradeFromAnswer,
  INITIAL_SM2,
  isDue,
  MAX_EASE,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  reviewSm2,
  toPayload,
  visualDecayAlpha,
  type Sm2State,
} from "@/lib/sm2";

const NOW = Date.UTC(2026, 7, 23);
const DAY = 24 * 60 * 60 * 1000;

describe("reviewSm2", () => {
  it("follows the published interval ladder: 1, 6, then ease-multiplied", () => {
    let s = reviewSm2(INITIAL_SM2, 4, NOW);
    expect(s.intervalDays).toBe(1);
    expect(s.repetitions).toBe(1);

    s = reviewSm2(s, 4, NOW);
    expect(s.intervalDays).toBe(6);
    expect(s.repetitions).toBe(2);

    s = reviewSm2(s, 4, NOW);
    expect(s.repetitions).toBe(3);
    expect(s.intervalDays).toBe(Math.round(6 * s.easeFactor));
  });

  it("starts at the 2.5 ease baseline the brief specifies", () => {
    expect(INITIAL_SM2.easeFactor).toBe(2.5);
    expect(toPayload(INITIAL_SM2, NOW).ease_factor).toBe(2.5);
  });

  it("leaves ease roughly unchanged on a grade of 4", () => {
    const s = reviewSm2(INITIAL_SM2, 4, NOW);
    expect(s.easeFactor).toBeCloseTo(2.5, 5);
  });

  it("raises ease on a perfect recall and lowers it on a laboured one", () => {
    expect(reviewSm2(INITIAL_SM2, 5, NOW).easeFactor).toBeGreaterThan(2.5);
    expect(reviewSm2(INITIAL_SM2, 3, NOW).easeFactor).toBeLessThan(2.5);
  });

  it("resets repetitions and returns the card tomorrow on a lapse", () => {
    let s = INITIAL_SM2;
    for (let i = 0; i < 5; i += 1) s = reviewSm2(s, 5, NOW);
    expect(s.repetitions).toBe(5);
    expect(s.intervalDays).toBeGreaterThan(10);

    const lapsed = reviewSm2(s, 1, NOW);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
  });

  it("keeps the ease penalty through a lapse, so a repeatedly-failed card gets harder", () => {
    // The whole point of SM-2: failing should not hand you a clean slate.
    let s = INITIAL_SM2;
    const first = reviewSm2(s, 0, NOW);
    s = reviewSm2(first, 0, NOW);
    expect(s.easeFactor).toBeLessThan(first.easeFactor);
    expect(s.easeFactor).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it("never lets ease fall below the SM-2 floor or exceed the ceiling", () => {
    let low = INITIAL_SM2;
    for (let i = 0; i < 40; i += 1) low = reviewSm2(low, 0, NOW);
    expect(low.easeFactor).toBe(MIN_EASE);

    let high = INITIAL_SM2;
    for (let i = 0; i < 40; i += 1) high = reviewSm2(high, 5, NOW);
    expect(high.easeFactor).toBeLessThanOrEqual(MAX_EASE);
  });

  it("caps the interval so nothing vanishes for longer than a year", () => {
    let s = INITIAL_SM2;
    for (let i = 0; i < 30; i += 1) s = reviewSm2(s, 5, NOW);
    expect(s.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
    expect(s.intervalDays).toBeGreaterThan(0);
  });

  it("survives a corrupt stored state", () => {
    const corrupt: Sm2State = {
      intervalDays: Number.NaN,
      easeFactor: Number.NaN,
      repetitions: -5,
      lastReviewedMs: null,
    };
    const s = reviewSm2(corrupt, 4, NOW);
    expect(Number.isFinite(s.easeFactor)).toBe(true);
    expect(Number.isFinite(s.intervalDays)).toBe(true);
    expect(s.repetitions).toBeGreaterThanOrEqual(0);
  });

  it("clamps an out-of-range grade rather than trusting it", () => {
    const high = reviewSm2(INITIAL_SM2, 99 as never, NOW);
    const five = reviewSm2(INITIAL_SM2, 5, NOW);
    expect(high.easeFactor).toBe(five.easeFactor);
  });
});

describe("scheduling", () => {
  it("computes a due date from the last review plus the interval", () => {
    const s = reviewSm2(INITIAL_SM2, 4, NOW);
    expect(dueAtMs(s)).toBe(NOW + 1 * DAY);
  });

  it("treats a never-reviewed concept as due now, not as never due", () => {
    // An unseen concept is the most urgent thing there is.
    expect(dueAtMs(INITIAL_SM2)).toBeNull();
    expect(isDue(INITIAL_SM2, NOW)).toBe(true);
  });

  it("is not due before its interval elapses", () => {
    const s = reviewSm2(INITIAL_SM2, 4, NOW);
    expect(isDue(s, NOW + 0.5 * DAY)).toBe(false);
    expect(isDue(s, NOW + 1.1 * DAY)).toBe(true);
  });
});

describe("visualDecayAlpha", () => {
  it("is full brightness immediately after a review", () => {
    const s = reviewSm2(INITIAL_SM2, 4, NOW);
    expect(visualDecayAlpha(s, NOW)).toBe(1);
  });

  it("fades to zero exactly when the concept comes due", () => {
    const s = reviewSm2(INITIAL_SM2, 4, NOW);
    expect(visualDecayAlpha(s, NOW + 0.5 * DAY)).toBeCloseTo(0.5, 2);
    expect(visualDecayAlpha(s, NOW + 1 * DAY)).toBe(0);
  });

  it("never reports below zero once overdue", () => {
    const s = reviewSm2(INITIAL_SM2, 4, NOW);
    expect(visualDecayAlpha(s, NOW + 90 * DAY)).toBe(0);
  });

  it("shows an unseen concept as present, not as faded", () => {
    // It has not decayed; it has not started.
    expect(visualDecayAlpha(INITIAL_SM2, NOW)).toBe(1);
  });

  it("stays in 0..1 across a long schedule", () => {
    let s = INITIAL_SM2;
    for (let i = 0; i < 8; i += 1) s = reviewSm2(s, 5, NOW);
    for (let d = 0; d < 400; d += 7) {
      const a = visualDecayAlpha(s, NOW + d * DAY);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

describe("gradeFromAnswer", () => {
  it("grades a wrong answer as a lapse", () => {
    expect(gradeFromAnswer({ isCorrect: false })).toBeLessThan(3);
  });

  it("grades a slow wrong answer more harshly than a fast one", () => {
    const slow = gradeFromAnswer({
      isCorrect: false,
      responseMs: 30_000,
      baselineMs: 8_000,
    });
    const quick = gradeFromAnswer({ isCorrect: false, responseMs: 6_000, baselineMs: 8_000 });
    expect(slow).toBeLessThan(quick);
  });

  it("rewards an instant recall above a laboured one", () => {
    const instant = gradeFromAnswer({ isCorrect: true, responseMs: 4_000, baselineMs: 8_000 });
    const laboured = gradeFromAnswer({ isCorrect: true, responseMs: 20_000, baselineMs: 8_000 });
    expect(instant).toBe(5);
    expect(laboured).toBe(3);
    expect(instant).toBeGreaterThan(laboured);
  });

  it("does not treat an answer given after reading the explanation as free recall", () => {
    expect(gradeFromAnswer({ isCorrect: true, usedHelp: true })).toBe(3);
  });

  it("defaults to a normal pass when there is no timing baseline", () => {
    expect(gradeFromAnswer({ isCorrect: true })).toBe(4);
    expect(gradeFromAnswer({ isCorrect: true, responseMs: 5000, baselineMs: null })).toBe(4);
  });

  it("always returns a valid SM-2 grade", () => {
    const cases = [
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: true, responseMs: 0, baselineMs: 0 },
      { isCorrect: false, responseMs: -5, baselineMs: 10 },
    ];
    for (const c of cases) {
      const g = gradeFromAnswer(c);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(5);
      expect(Number.isInteger(g)).toBe(true);
    }
  });
});

describe("toPayload", () => {
  it("emits the exact field names the brief specifies", () => {
    const payload = toPayload(reviewSm2(INITIAL_SM2, 4, NOW), NOW);
    expect(Object.keys(payload).sort()).toEqual([
      "ease_factor",
      "interval_days",
      "repetitions",
      "visual_decay_alpha",
    ]);
  });

  it("rounds ease so it serialises cleanly", () => {
    let s = INITIAL_SM2;
    for (let i = 0; i < 6; i += 1) s = reviewSm2(s, 5, NOW);
    const payload = toPayload(s, NOW);
    expect(String(payload.ease_factor)).not.toMatch(/\d{5,}/);
  });
});
