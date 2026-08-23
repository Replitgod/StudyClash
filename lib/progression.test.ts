import { describe, expect, it } from "vitest";
import {
  advanceStreak,
  daysBetween,
  levelForXp,
  levelProgress,
  localDateKey,
  questProgress,
  questsForToday,
  QUEST_CATALOGUE,
  xpForLevel,
  XP_REASONS,
  type StreakState,
} from "@/lib/progression";

describe("XP_REASONS", () => {
  it("pays more for fixing a mistake than for answering a question", () => {
    // Section 17: reward learning, not grinding. If volume paid best, the
    // optimal strategy would be to answer easy questions forever.
    expect(XP_REASONS.mistake_recovered.amount).toBeGreaterThan(
      XP_REASONS.question_answered.amount * 10
    );
    expect(XP_REASONS.topic_improved.amount).toBeGreaterThan(
      XP_REASONS.question_answered.amount * 10
    );
  });

  it("has a positive amount and a label for every reason", () => {
    for (const [key, value] of Object.entries(XP_REASONS)) {
      expect(value.amount, key).toBeGreaterThan(0);
      expect(value.label.length, key).toBeGreaterThan(2);
    }
  });
});

describe("levels", () => {
  it("starts everyone at level 1 with no XP", () => {
    expect(levelForXp(0)).toBe(1);
    expect(xpForLevel(1)).toBe(0);
    expect(levelProgress(0).level).toBe(1);
  });

  it("is the exact inverse of the level cost curve", () => {
    for (let level = 1; level <= 60; level += 1) {
      const cost = xpForLevel(level);
      expect(levelForXp(cost), `at level ${level}`).toBe(level);
      // One XP short of the threshold must still be the previous level.
      if (level > 1) expect(levelForXp(cost - 1)).toBe(level - 1);
    }
  });

  it("makes each level cost more than the last", () => {
    for (let level = 2; level < 40; level += 1) {
      const thisLevel = xpForLevel(level + 1) - xpForLevel(level);
      const previous = xpForLevel(level) - xpForLevel(level - 1);
      expect(thisLevel).toBeGreaterThan(previous);
    }
  });

  it("reports progress inside the current level", () => {
    const atFloor = levelProgress(xpForLevel(5));
    expect(atFloor.level).toBe(5);
    expect(atFloor.xpIntoLevel).toBe(0);
    expect(atFloor.percent).toBe(0);
    expect(atFloor.xpToNextLevel).toBe(xpForLevel(6) - xpForLevel(5));

    const midway = levelProgress(
      xpForLevel(5) + Math.floor((xpForLevel(6) - xpForLevel(5)) / 2)
    );
    expect(midway.percent).toBeGreaterThan(40);
    expect(midway.percent).toBeLessThan(60);
  });

  it("handles negative and absurd input without breaking", () => {
    expect(levelProgress(-500).level).toBe(1);
    expect(levelProgress(-500).percent).toBe(0);
    const huge = levelProgress(Number.MAX_SAFE_INTEGER);
    expect(Number.isFinite(huge.level)).toBe(true);
    expect(huge.percent).toBeLessThanOrEqual(100);
    expect(huge.percent).toBeGreaterThanOrEqual(0);
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-08-20", "2026-08-23")).toBe(3);
    expect(daysBetween("2026-08-23", "2026-08-23")).toBe(0);
    expect(daysBetween("2026-08-23", "2026-08-20")).toBe(-3);
  });

  it("counts across a month boundary", () => {
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
  });

  it("counts across a leap day", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("returns 0 for unparseable input rather than NaN", () => {
    expect(daysBetween("not-a-date", "2026-08-23")).toBe(0);
  });
});

describe("advanceStreak", () => {
  const fresh: StreakState = {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveOn: null,
    streakFreezes: 0,
  };

  it("starts a streak on the first day of study", () => {
    const result = advanceStreak(fresh, "2026-08-23");
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.extended).toBe(true);
  });

  it("extends on a consecutive day", () => {
    const result = advanceStreak(
      { ...fresh, currentStreak: 4, longestStreak: 4, lastActiveOn: "2026-08-22" },
      "2026-08-23"
    );
    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(5);
  });

  it("does not count a second session on the same day", () => {
    const state = {
      ...fresh,
      currentStreak: 3,
      longestStreak: 3,
      lastActiveOn: "2026-08-23",
    };
    const result = advanceStreak(state, "2026-08-23");
    expect(result.currentStreak).toBe(3);
    expect(result.extended).toBe(false);
  });

  it("spends a freeze to cover exactly one missed day", () => {
    const result = advanceStreak(
      {
        currentStreak: 9,
        longestStreak: 9,
        lastActiveOn: "2026-08-21",
        streakFreezes: 1,
      },
      "2026-08-23"
    );
    expect(result.usedFreeze).toBe(true);
    expect(result.currentStreak).toBe(10);
    expect(result.streakFreezes).toBe(0);
    expect(result.broken).toBe(false);
  });

  it("breaks after a missed day with no freeze", () => {
    const result = advanceStreak(
      { currentStreak: 9, longestStreak: 9, lastActiveOn: "2026-08-21", streakFreezes: 0 },
      "2026-08-23"
    );
    expect(result.broken).toBe(true);
    expect(result.currentStreak).toBe(1);
    // The record still stands -- losing a streak should not erase the proof
    // they once had it.
    expect(result.longestStreak).toBe(9);
  });

  it("breaks after a long absence even with freezes in hand", () => {
    const result = advanceStreak(
      { currentStreak: 20, longestStreak: 20, lastActiveOn: "2026-07-01", streakFreezes: 3 },
      "2026-08-23"
    );
    expect(result.broken).toBe(true);
    expect(result.currentStreak).toBe(1);
    expect(result.streakFreezes).toBe(3);
  });

  it("earns a freeze every fifth consecutive day, up to a cap", () => {
    let state: StreakState = { ...fresh };
    const start = Date.UTC(2026, 0, 1);
    for (let day = 0; day < 30; day += 1) {
      const iso = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
      const result = advanceStreak(state, iso);
      state = {
        currentStreak: result.currentStreak,
        longestStreak: result.longestStreak,
        lastActiveOn: result.lastActiveOn,
        streakFreezes: result.streakFreezes,
      };
    }
    expect(state.currentStreak).toBe(30);
    expect(state.streakFreezes).toBeLessThanOrEqual(3);
    expect(state.streakFreezes).toBeGreaterThan(0);
  });

  it("ignores a clock that has gone backwards", () => {
    const result = advanceStreak(
      { currentStreak: 5, longestStreak: 5, lastActiveOn: "2026-08-23", streakFreezes: 0 },
      "2026-08-20"
    );
    expect(result.currentStreak).toBe(5);
    expect(result.extended).toBe(false);
  });
});

describe("localDateKey", () => {
  it("formats a date as YYYY-MM-DD with padding", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("uses local time, not UTC", () => {
    // A streak is about the student's day. Late-evening study must not land
    // on tomorrow because the server happens to be ahead of them.
    const lateEvening = new Date(2026, 7, 23, 23, 30);
    expect(localDateKey(lateEvening)).toBe("2026-08-23");
  });
});

describe("quests", () => {
  it("clamps progress to the target", () => {
    const result = questProgress("daily_training", 999);
    expect(result.progress).toBe(result.target);
    expect(result.percent).toBe(100);
    expect(result.isComplete).toBe(true);
  });

  it("never reports negative progress", () => {
    const result = questProgress("comeback", -5);
    expect(result.progress).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.isComplete).toBe(false);
  });

  it("only offers a battle quest once the student has battled", () => {
    // A quest that cannot be completed teaches the student to ignore quests.
    expect(questsForToday({ hasReviewsDue: true, hasBattled: false })).not.toContain(
      "competitor"
    );
    expect(questsForToday({ hasReviewsDue: true, hasBattled: true })).toContain(
      "competitor"
    );
  });

  it("only offers a review quest when reviews are actually due", () => {
    expect(questsForToday({ hasReviewsDue: false, hasBattled: true })).not.toContain(
      "consistency"
    );
  });

  it("always offers something", () => {
    const none = questsForToday({ hasReviewsDue: false, hasBattled: false });
    expect(none.length).toBeGreaterThan(0);
  });

  it("has a sane definition for every quest it can offer", () => {
    for (const [key, definition] of Object.entries(QUEST_CATALOGUE)) {
      expect(definition.target, key).toBeGreaterThan(0);
      expect(definition.title.length, key).toBeGreaterThan(2);
      expect(definition.description.length, key).toBeGreaterThan(4);
    }
  });
});
