import { describe, expect, it } from "vitest";
import { bucketFor, progressBreakdown } from "./progressBreakdown";
import { computeMastery } from "./mastery";
import type { TopicSummary } from "./studySnapshot";

function topic(name: string, overrides: Partial<TopicSummary> = {}): TopicSummary {
  const state = computeMastery({ correct: 5, total: 10, sessions: 2, lastPracticedMs: 0, now: 0 });
  return {
    topic: name,
    deckId: "d",
    deckTitle: "Deck",
    course: "General",
    correct: 5,
    total: 10,
    accuracy: 50,
    mastery: state.mastery,
    state,
    tier: state.tier,
    isDue: false,
    isFading: false,
    priority: 0.5,
    confidentMisses: 0,
    ...overrides,
  };
}

describe("bucketFor", () => {
  it("puts a known topic that is fading in Slipping, ahead of its tier", () => {
    expect(bucketFor({ tier: "mastered", isFading: true })).toBe("slipping");
    expect(bucketFor({ tier: "developing", isFading: true })).toBe("slipping");
  });

  it("does not call a topic that was never learned 'slipping'", () => {
    expect(bucketFor({ tier: "needs_review", isFading: true })).toBe("needs_work");
  });

  it("maps the tiers to plain words", () => {
    expect(bucketFor({ tier: "strong", isFading: false })).toBe("mastered");
    expect(bucketFor({ tier: "developing", isFading: false })).toBe("learning");
    expect(bucketFor({ tier: "needs_review", isFading: false })).toBe("needs_work");
  });
});

describe("progressBreakdown", () => {
  it("counts every topic exactly once, in a fixed order", () => {
    const result = progressBreakdown([
      topic("A", { tier: "mastered" }),
      topic("B", { tier: "developing" }),
      topic("C", { tier: "needs_review" }),
      topic("D", { tier: "strong", isFading: true }),
    ]);
    expect(result.total).toBe(4);
    expect(result.buckets.map((b) => [b.id, b.count])).toEqual([
      ["mastered", 1],
      ["learning", 1],
      ["slipping", 1],
      ["needs_work", 1],
    ]);
  });

  it("lists the most urgent topic first within a bucket", () => {
    const result = progressBreakdown([
      topic("Low", { tier: "needs_review", priority: 0.2 }),
      topic("High", { tier: "needs_review", priority: 0.9 }),
    ]);
    expect(result.buckets.find((b) => b.id === "needs_work")?.topics.map((t) => t.topic)).toEqual([
      "High",
      "Low",
    ]);
  });
});
