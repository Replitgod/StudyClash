import { describe, expect, it } from "vitest";
import { getMasteryTier, MIN_ATTEMPTS_FOR_HIGH_TIER } from "./masteryTiers";

describe("getMasteryTier", () => {
  it("returns needs_review for zero attempts", () => {
    expect(getMasteryTier(0, 0)).toBe("needs_review");
  });

  it("returns needs_review below 50% accuracy", () => {
    expect(getMasteryTier(1, 4)).toBe("needs_review"); // 25%
    expect(getMasteryTier(2, 5)).toBe("needs_review"); // 40%
  });

  it("returns developing between 50% and 75% accuracy", () => {
    expect(getMasteryTier(2, 4)).toBe("developing"); // 50%
    expect(getMasteryTier(5, 8)).toBe("developing"); // 62.5%
  });

  it("does not mark a topic mastered from a single correct answer -- the premature-mastery bug this module fixes", () => {
    expect(getMasteryTier(1, 1)).toBe("developing"); // 100% accuracy, but only 1 attempt
    expect(getMasteryTier(2, 2)).toBe("developing"); // 100% accuracy, only 2 attempts
  });

  it("allows mastered/strong once the minimum attempt count is reached", () => {
    expect(MIN_ATTEMPTS_FOR_HIGH_TIER).toBe(3);
    expect(getMasteryTier(3, 3)).toBe("mastered"); // 100% over 3 attempts
    expect(getMasteryTier(9, 10)).toBe("mastered"); // 90% over 10 attempts
  });

  it("returns strong for high accuracy just under the mastered threshold, with enough attempts", () => {
    expect(getMasteryTier(8, 10)).toBe("strong"); // 80%
  });

  it("caps at developing even at high accuracy if attempts are still below the minimum", () => {
    expect(getMasteryTier(2, 2)).toBe("developing");
    // 3 attempts is exactly the minimum, so this should clear into a high tier
    expect(getMasteryTier(3, 3)).not.toBe("developing");
  });

  it("is monotonic: more correct answers at the same total never lowers the tier", () => {
    const tierRank = { needs_review: 0, developing: 1, strong: 2, mastered: 3 };
    for (let total = 1; total <= 10; total++) {
      let prevRank = -1;
      for (let correct = 0; correct <= total; correct++) {
        const rank = tierRank[getMasteryTier(correct, total)];
        expect(rank).toBeGreaterThanOrEqual(prevRank);
        prevRank = rank;
      }
    }
  });
});
