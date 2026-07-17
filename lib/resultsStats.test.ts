import { describe, expect, it } from "vitest";
import { buildTopicStats, calculateAccuracy } from "./resultsStats";

describe("calculateAccuracy", () => {
  it("rounds to the nearest whole percent", () => {
    expect(calculateAccuracy(1, 3)).toBe(33);
    expect(calculateAccuracy(2, 3)).toBe(67);
  });

  it("returns 100 for a perfect score", () => {
    expect(calculateAccuracy(5, 5)).toBe(100);
  });

  it("returns 0 for zero correct", () => {
    expect(calculateAccuracy(0, 5)).toBe(0);
  });

  it("returns 0 rather than dividing by zero when there are no questions", () => {
    expect(calculateAccuracy(0, 0)).toBe(0);
  });
});

describe("buildTopicStats", () => {
  it("groups items by topic and computes per-topic accuracy", () => {
    const stats = buildTopicStats([
      { question: { topic: "Algebra" }, isCorrect: true },
      { question: { topic: "Algebra" }, isCorrect: false },
      { question: { topic: "Geometry" }, isCorrect: true },
    ]);

    const algebra = stats.find((s) => s.topic === "Algebra");
    const geometry = stats.find((s) => s.topic === "Geometry");

    expect(algebra).toEqual({ topic: "Algebra", correct: 1, total: 2, accuracy: 50 });
    expect(geometry).toEqual({ topic: "Geometry", correct: 1, total: 1, accuracy: 100 });
  });

  it("falls back to a 'General' bucket for missing topics, so no question is silently dropped", () => {
    const stats = buildTopicStats([{ question: { topic: null }, isCorrect: false }]);
    expect(stats).toEqual([{ topic: "General", correct: 0, total: 1, accuracy: 0 }]);
  });

  it("returns an empty array for no review items", () => {
    expect(buildTopicStats([])).toEqual([]);
  });

  it("identifies the weakest topic by lowest accuracy, matching the deterministic weak-topic rule", () => {
    const stats = buildTopicStats([
      { question: { topic: "Strong" }, isCorrect: true },
      { question: { topic: "Strong" }, isCorrect: true },
      { question: { topic: "Weak" }, isCorrect: false },
      { question: { topic: "Weak" }, isCorrect: true },
    ]);
    const weakest = [...stats].sort((a, b) => a.accuracy - b.accuracy)[0];
    expect(weakest.topic).toBe("Weak");
  });
});
