import { describe, expect, it } from "vitest";
import {
  applyResult,
  daysRemaining,
  didRankChange,
  expectedScore,
  kFactor,
  outcomeFromScores,
  rankForRating,
  rankProgress,
  seasonResetRating,
  STARTING_DEVIATION,
  STARTING_RATING,
  winRate,
} from "@/lib/ranking";

describe("expectedScore", () => {
  it("is even between equal ratings", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 6);
  });

  it("gives roughly 10-to-1 odds across 400 points", () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 3);
    expect(expectedScore(1200, 1600)).toBeCloseTo(1 / 11, 3);
  });

  it("always lands between 0 and 1", () => {
    for (const gap of [-5000, -400, 0, 400, 5000]) {
      const value = expectedScore(1200, 1200 + gap);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("kFactor", () => {
  it("moves an uncertain rating faster than a settled one", () => {
    expect(kFactor(STARTING_DEVIATION)).toBeGreaterThan(kFactor(50));
  });

  it("stays inside sane bounds for any input", () => {
    for (const deviation of [-100, 0, 45, 350, 10_000]) {
      const k = kFactor(deviation);
      expect(k).toBeGreaterThanOrEqual(16);
      expect(k).toBeLessThanOrEqual(64);
    }
  });
});

describe("applyResult", () => {
  const settled = { rating: 1400, deviation: 60 };

  it("pays more for beating a stronger opponent", () => {
    const upset = applyResult(settled, { score: 1, opponentRating: 1800 });
    const expected = applyResult(settled, { score: 1, opponentRating: 1000 });
    expect(upset.delta).toBeGreaterThan(expected.delta);
    expect(upset.delta).toBeGreaterThan(0);
  });

  it("costs more for losing to a weaker opponent", () => {
    const bad = applyResult(settled, { score: 0, opponentRating: 1000 });
    const forgivable = applyResult(settled, { score: 0, opponentRating: 1800 });
    expect(bad.delta).toBeLessThan(forgivable.delta);
    expect(bad.delta).toBeLessThan(0);
  });

  it("barely moves an even match", () => {
    const draw = applyResult(settled, { score: 0.5, opponentRating: 1400 });
    expect(Math.abs(draw.delta)).toBeLessThanOrEqual(1);
  });

  it("moves a provisional player faster than a settled one", () => {
    const newcomer = applyResult(
      { rating: 1000, deviation: STARTING_DEVIATION },
      { score: 1, opponentRating: 1000 }
    );
    const veteran = applyResult(
      { rating: 1000, deviation: 50 },
      { score: 1, opponentRating: 1000 }
    );
    expect(newcomer.delta).toBeGreaterThan(veteran.delta);
  });

  it("shrinks deviation with every rated game, down to a floor", () => {
    let state = { rating: 1000, deviation: STARTING_DEVIATION };
    for (let i = 0; i < 200; i += 1) {
      const result = applyResult(state, { score: 0.5, opponentRating: 1000 });
      state = { rating: result.rating, deviation: result.deviation };
    }
    expect(state.deviation).toBeGreaterThanOrEqual(45);
    expect(state.deviation).toBeLessThan(60);
  });

  it("never drops a rating below the floor", () => {
    let state = { rating: 150, deviation: 60 };
    for (let i = 0; i < 50; i += 1) {
      const result = applyResult(state, { score: 0, opponentRating: 2500 });
      state = { rating: result.rating, deviation: result.deviation };
    }
    expect(state.rating).toBeGreaterThanOrEqual(100);
  });

  it("reports a delta that matches the rating it returns", () => {
    const before = 1400;
    const result = applyResult({ rating: before, deviation: 60 }, {
      score: 1,
      opponentRating: 1600,
    });
    expect(result.rating - before).toBe(result.delta);
  });

  it("survives corrupt stored values", () => {
    const result = applyResult(
      { rating: Number.NaN, deviation: Number.NaN },
      { score: 1, opponentRating: 1200 }
    );
    expect(Number.isFinite(result.rating)).toBe(true);
    expect(Number.isFinite(result.delta)).toBe(true);
  });

  it("clamps an out-of-range score rather than trusting it", () => {
    const cheat = applyResult({ rating: 1200, deviation: 60 }, {
      score: 99,
      opponentRating: 1200,
    });
    const honest = applyResult({ rating: 1200, deviation: 60 }, {
      score: 1,
      opponentRating: 1200,
    });
    expect(cheat.delta).toBe(honest.delta);
  });
});

describe("outcomeFromScores", () => {
  it("scores a thrashing above a narrow win", () => {
    expect(outcomeFromScores(20, 2)).toBeGreaterThan(outcomeFromScores(11, 10));
  });

  it("treats an equal result as a draw", () => {
    expect(outcomeFromScores(10, 10)).toBeCloseTo(0.5, 6);
  });

  it("never returns the extremes, so one perfect game is not decisive", () => {
    const perfect = outcomeFromScores(20, 0);
    expect(perfect).toBeLessThan(1);
    expect(perfect).toBeGreaterThan(0.8);
    const wipeout = outcomeFromScores(0, 20);
    expect(wipeout).toBeGreaterThan(0);
  });

  it("calls a scoreless match a draw rather than dividing by zero", () => {
    expect(outcomeFromScores(0, 0)).toBe(0.5);
  });
});

describe("rankForRating", () => {
  it("starts a new player in Bronze", () => {
    expect(rankForRating(0).tier).toBe("bronze");
  });

  it("climbs through every tier in order as rating rises", () => {
    const seen = [0, 950, 1250, 1550, 1850, 2150, 2400, 2700].map(
      (r) => rankForRating(r).tier
    );
    expect(seen).toEqual([
      "bronze",
      "silver",
      "gold",
      "platinum",
      "diamond",
      "master",
      "grandmaster",
      "elite",
    ]);
  });

  it("numbers divisions downward, so I is the top of a tier", () => {
    // Gold spans 1200-1500.
    expect(rankForRating(1210).division).toBe(3);
    expect(rankForRating(1490).division).toBe(1);
    expect(rankForRating(1490).name).toBe("Gold I");
  });

  it("has no divisions in the apex tiers", () => {
    expect(rankForRating(2200).division).toBeNull();
    expect(rankForRating(2200).name).toBe("Master");
    expect(rankForRating(9999).name).toBe("AcedIQ Elite");
  });

  it("never produces an invalid division for any rating", () => {
    for (let rating = 0; rating <= 3200; rating += 7) {
      const rank = rankForRating(rating);
      if (rank.division !== null) {
        expect(rank.division, `at ${rating}`).toBeGreaterThanOrEqual(1);
        expect(rank.division, `at ${rating}`).toBeLessThanOrEqual(3);
      }
      expect(rank.name).not.toMatch(/undefined|NaN/);
    }
  });

  it("handles a corrupt rating", () => {
    // Falls back to the starting rating, which sits in Silver.
    expect(rankForRating(Number.NaN).tier).toBe(rankForRating(STARTING_RATING).tier);
    expect(rankForRating(-500).tier).toBe("bronze");
  });
});

describe("rankProgress", () => {
  it("runs 0 to 100 across a tier", () => {
    expect(rankProgress(1200)).toBe(0);
    expect(rankProgress(1499)).toBeGreaterThan(95);
  });

  it("is full at the top of the ladder", () => {
    expect(rankProgress(5000)).toBe(100);
  });

  it("stays in range for every rating", () => {
    for (let rating = -200; rating <= 3200; rating += 13) {
      const value = rankProgress(rating);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe("didRankChange", () => {
  it("notices a promotion and a demotion", () => {
    expect(didRankChange(1190, 1210)).toBe("up");
    expect(didRankChange(1210, 1190)).toBe("down");
  });

  it("stays quiet inside the same rank", () => {
    expect(didRankChange(1210, 1220)).toBeNull();
  });
});

describe("seasons", () => {
  it("counts days remaining and never goes negative", () => {
    const now = Date.parse("2026-08-23T00:00:00Z");
    expect(daysRemaining({ endsAt: "2026-09-19T00:00:00Z" }, now)).toBe(27);
    expect(daysRemaining({ endsAt: "2026-08-01T00:00:00Z" }, now)).toBe(0);
  });

  it("handles an unparseable end date", () => {
    expect(daysRemaining({ endsAt: "soon" })).toBe(0);
  });

  it("pulls ratings toward the start without erasing them", () => {
    // A full reset makes the first week of every season pure noise.
    expect(seasonResetRating(1900)).toBeLessThan(1900);
    expect(seasonResetRating(1900)).toBeGreaterThan(STARTING_RATING);
    expect(seasonResetRating(STARTING_RATING)).toBe(STARTING_RATING);
    expect(seasonResetRating(400)).toBeLessThan(STARTING_RATING);
    expect(seasonResetRating(400)).toBeGreaterThan(400);
  });
});

describe("winRate", () => {
  it("reports a percentage, or nothing before any games", () => {
    expect(winRate(3, 1)).toBe(75);
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(0, 5)).toBe(0);
  });
});
