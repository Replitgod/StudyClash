import { describe, expect, it } from "vitest";
import {
  cleanPattern,
  extractPatterns,
  findOpportunities,
  type MistakeRecord,
} from "@/lib/weakness";
import { computeMastery } from "@/lib/mastery";
import type { TopicSummary } from "@/lib/studySnapshot";

const NOW = Date.UTC(2026, 7, 23);
const DAY = 24 * 60 * 60 * 1000;

function topic(overrides: Partial<TopicSummary> & { topic: string }): TopicSummary {
  const correct = overrides.correct ?? 3;
  const total = overrides.total ?? 10;
  const state =
    overrides.state ??
    computeMastery({
      correct,
      total,
      sessions: 3,
      lastPracticedMs: NOW,
      now: NOW,
    });

  return {
    deckId: "deck-1",
    deckTitle: "Algebra II",
    course: "Math",
    correct,
    total,
    accuracy: Math.round((correct / total) * 100),
    mastery: state.mastery,
    state,
    tier: state.tier,
    isDue: state.isDue,
    isFading: state.isFading,
    priority: 1 - state.mastery / 100,
    ...overrides,
  };
}

function mistake(concept: string, overrides: Partial<MistakeRecord> = {}): MistakeRecord {
  return {
    deckId: "deck-1",
    topic: "Radical Equations",
    concept,
    ...overrides,
  };
}

describe("cleanPattern", () => {
  it("strips a leading topic prefix", () => {
    expect(cleanPattern("Radical Equations: extraneous solutions", "Radical Equations")).toBe(
      "extraneous solutions"
    );
  });

  it("leaves a colon alone when it is not a topic prefix", () => {
    const result = cleanPattern("ratio test: when it is inconclusive", "Series");
    expect(result).toContain("inconclusive");
  });

  it("truncates a wall of question text at a word boundary", () => {
    const long =
      "Radical Equations: Solve the equation for x where the radicand contains a quadratic expression and the domain must be checked carefully afterwards";
    const result = cleanPattern(long, "Radical Equations");
    expect(result.length).toBeLessThanOrEqual(74);
    expect(result.endsWith("…")).toBe(true);
    // Should not cut mid-word.
    expect(result).not.toMatch(/\s\S{1,2}…$/);
  });

  it("returns empty for nothing usable", () => {
    expect(cleanPattern("", "Topic")).toBe("");
    expect(cleanPattern("   ", "Topic")).toBe("");
  });

  it("does not leave a trailing full stop or leading article", () => {
    expect(cleanPattern("The domain restriction.", "Radicals")).toBe("domain restriction");
  });
});

describe("extractPatterns", () => {
  it("counts how often each sub-skill comes up", () => {
    const patterns = extractPatterns(
      [
        mistake("Radical Equations: extraneous solutions"),
        mistake("Radical Equations: extraneous solutions"),
        mistake("Radical Equations: domain restrictions"),
      ],
      "Radical Equations"
    );
    expect(patterns[0].label).toBe("extraneous solutions");
    expect(patterns[0].count).toBe(2);
    expect(patterns[1].count).toBe(1);
  });

  it("merges near-duplicate phrasings of the same misunderstanding", () => {
    // Three phrasings of one problem must not look like three problems.
    const patterns = extractPatterns(
      [
        mistake("forgetting to check extraneous solutions"),
        mistake("forgetting to check extraneous solutions again"),
        mistake("forgetting to check extraneous solutions in radicals"),
      ],
      "Radical Equations"
    );
    expect(patterns).toHaveLength(1);
    expect(patterns[0].count).toBe(3);
  });

  it("keeps the shortest phrasing of a merged pattern", () => {
    const patterns = extractPatterns(
      [
        mistake("domain restrictions when squaring both sides of the equation"),
        mistake("domain restrictions when squaring"),
      ],
      "Radical Equations"
    );
    expect(patterns[0].label).toBe("domain restrictions when squaring");
  });

  it("caps how many it returns", () => {
    const many = Array.from({ length: 20 }, (_, i) => mistake(`distinct problem number ${i}`));
    expect(extractPatterns(many, "Radical Equations").length).toBeLessThanOrEqual(3);
  });

  it("returns nothing rather than junk when there is nothing usable", () => {
    expect(extractPatterns([], "Radical Equations")).toEqual([]);
    expect(extractPatterns([mistake("")], "Radical Equations")).toEqual([]);
  });
});

describe("findOpportunities", () => {
  it("will not call something a weakness on too little evidence", () => {
    // One miss out of two proves nothing, and sending a student to fix a
    // topic they are fine at teaches them the recommendation is guesswork.
    const result = findOpportunities({
      topics: [topic({ topic: "Barely Seen", correct: 1, total: 2 })],
      mistakes: [],
    });
    expect(result).toEqual([]);
  });

  it("ignores a topic that is already mastered", () => {
    const mastered = topic({ topic: "Functions", correct: 20, total: 20 });
    const result = findOpportunities({ topics: [mastered], mistakes: [] });
    expect(result).toEqual([]);
  });

  it("does surface a mastered topic that is now slipping", () => {
    const state = computeMastery({
      correct: 20,
      total: 20,
      sessions: 4,
      lastPracticedMs: NOW - 60 * DAY,
      now: NOW,
    });
    const fading = topic({
      topic: "Functions",
      correct: 20,
      total: 20,
      state,
      tier: state.tier,
      isFading: true,
      priority: 0.9,
    });
    const result = findOpportunities({ topics: [fading], mistakes: [] });
    expect(result).toHaveLength(1);
    expect(result[0].reason).toMatch(/slipping/i);
  });

  it("orders by opportunity, not by raw accuracy", () => {
    const result = findOpportunities({
      topics: [
        topic({ topic: "Low priority", correct: 2, total: 10, priority: 0.2 }),
        topic({ topic: "High priority", correct: 6, total: 10, priority: 0.9 }),
      ],
      mistakes: [],
    });
    expect(result[0].topic).toBe("High priority");
  });

  it("attaches the sub-skills recorded for that exact topic", () => {
    const result = findOpportunities({
      topics: [topic({ topic: "Radical Equations" })],
      mistakes: [
        mistake("extraneous solutions"),
        mistake("extraneous solutions"),
        mistake("wrong deck entirely", { deckId: "other-deck" }),
        mistake("different topic", { topic: "Quadratics" }),
      ],
    });
    expect(result[0].patterns).toHaveLength(1);
    expect(result[0].patterns[0].label).toBe("extraneous solutions");
  });

  it("matches topics regardless of punctuation and case", () => {
    const result = findOpportunities({
      topics: [topic({ topic: "Radical Equations" })],
      mistakes: [mistake("extraneous solutions", { topic: "radical-equations!" })],
    });
    expect(result[0].patterns).toHaveLength(1);
  });

  it("still returns an actionable opportunity with no recorded mistakes", () => {
    const result = findOpportunities({
      topics: [topic({ topic: "Radical Equations" })],
      mistakes: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].patterns).toEqual([]);
    expect(result[0].reason.length).toBeGreaterThan(10);
    expect(result[0].minutes).toBeGreaterThan(0);
  });

  it("respects the limit", () => {
    const topics = Array.from({ length: 10 }, (_, i) =>
      topic({ topic: `Topic ${i}`, priority: i / 10 })
    );
    expect(findOpportunities({ topics, mistakes: [], limit: 2 })).toHaveLength(2);
  });

  it("reports a miss count that matches the record", () => {
    const result = findOpportunities({
      topics: [topic({ topic: "Radical Equations", correct: 3, total: 10 })],
      mistakes: [],
    });
    expect(result[0].missCount).toBe(7);
  });

  it("survives empty input", () => {
    expect(findOpportunities({ topics: [], mistakes: [] })).toEqual([]);
  });
});
