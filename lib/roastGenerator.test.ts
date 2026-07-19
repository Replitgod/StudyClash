import { describe, expect, it } from "vitest";
import { generateRoastLines, type RoastMatchStats } from "./roastGenerator";

// Every category the brief forbids -- roast lines may reference only score,
// speed, streak, accuracy, and missed topics, never any of these.
const FORBIDDEN_KEYWORDS = [
  "look",
  "ugly",
  "stupid",
  "dumb",
  "disab",
  "race",
  "religio",
  "gender",
  "sex",
  "body",
  "fat",
  "family",
  "poor",
  "rich",
  "money",
  "accommodation",
];

function baseStats(overrides: Partial<RoastMatchStats> = {}): RoastMatchStats {
  return {
    scorePoints: 640,
    accuracyPercent: 60,
    longestStreak: 3,
    totalQuestions: 10,
    correctAnswers: 6,
    avgResponseMs: 9200,
    questions: [],
    missedTopics: [],
    ...overrides,
  };
}

describe("generateRoastLines", () => {
  it("returns nothing when there are no questions", () => {
    expect(generateRoastLines(baseStats({ totalQuestions: 0, correctAnswers: 0 }), "seed")).toEqual([]);
  });

  it("returns a single flawless line for a 100% run instead of a roast", () => {
    const lines = generateRoastLines(
      baseStats({ totalQuestions: 5, correctAnswers: 5, accuracyPercent: 100 }),
      "seed"
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].category).toBe("flawless");
  });

  it("never generates a weak_topic line when there are no missed topics", () => {
    const lines = generateRoastLines(baseStats({ missedTopics: [] }), "seed");
    expect(lines.some((l) => l.category === "weak_topic")).toBe(false);
  });

  it("generates a weak_topic line referencing the most-missed topic when data exists", () => {
    const lines = generateRoastLines(
      baseStats({
        missedTopics: [
          { topic: "Algebra", missedCount: 1 },
          { topic: "Quadratics", missedCount: 3 },
        ],
      }),
      "seed"
    );
    const weakTopicLine = lines.find((l) => l.category === "weak_topic");
    expect(weakTopicLine?.text).toContain("Quadratics");
  });

  it("never generates a slow_question line below the speed threshold", () => {
    const lines = generateRoastLines(
      baseStats({
        questions: [
          { questionIndex: 1, topic: "Algebra", difficulty: "medium", responseTimeMs: 4000, isCorrect: true },
        ],
      }),
      "seed"
    );
    expect(lines.some((l) => l.category === "slow_question")).toBe(false);
  });

  it("generates a slow_question line referencing the slowest question at/above the threshold", () => {
    const lines = generateRoastLines(
      baseStats({
        questions: [
          { questionIndex: 4, topic: "Quadratics", difficulty: "medium", responseTimeMs: 38000, isCorrect: false },
        ],
      }),
      "seed"
    );
    const slowLine = lines.find((l) => l.category === "slow_question");
    expect(slowLine?.text).toContain("38 seconds");
    expect(slowLine?.text).toContain("Question 4");
  });

  it("never generates a streak line for a streak under 2", () => {
    const lines = generateRoastLines(baseStats({ longestStreak: 1 }), "seed");
    expect(lines.some((l) => l.category === "streak")).toBe(false);
  });

  it("caps output at maxLines", () => {
    const lines = generateRoastLines(
      baseStats({
        missedTopics: [{ topic: "Quadratics", missedCount: 2 }],
        questions: [
          { questionIndex: 4, topic: "Quadratics", difficulty: "medium", responseTimeMs: 38000, isCorrect: false },
        ],
      }),
      "seed",
      { maxLines: 1 }
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].category).toBe("weak_topic");
  });

  it("is stable: same stats and seed produce the same output every time", () => {
    const stats = baseStats({
      missedTopics: [{ topic: "Quadratics", missedCount: 2 }],
      questions: [
        { questionIndex: 4, topic: "Quadratics", difficulty: "medium", responseTimeMs: 38000, isCorrect: false },
      ],
    });
    const first = generateRoastLines(stats, "match_abc123");
    const second = generateRoastLines(stats, "match_abc123");
    expect(first).toEqual(second);
  });

  it("every template string in the pool avoids forbidden-category keywords (safety regression guard)", () => {
    const sampleQuestions = [
      { questionIndex: 1, topic: "Algebra", difficulty: "easy", responseTimeMs: 2000, isCorrect: true },
      { questionIndex: 2, topic: "Algebra", difficulty: "easy", responseTimeMs: 3000, isCorrect: true },
      { questionIndex: 3, topic: "Algebra", difficulty: "easy", responseTimeMs: 4000, isCorrect: true },
      { questionIndex: 4, topic: "Quadratics", difficulty: "medium", responseTimeMs: 38000, isCorrect: false },
      { questionIndex: 5, topic: "Quadratics", difficulty: "medium", responseTimeMs: 5000, isCorrect: false },
    ];
    const allSeeds = Array.from({ length: 50 }, (_, i) => `seed-${i}`);
    const allLines = allSeeds.flatMap((seed) =>
      generateRoastLines(
        baseStats({
          questions: sampleQuestions,
          missedTopics: [{ topic: "Quadratics", missedCount: 2 }],
        }),
        seed
      )
    );
    expect(allLines.length).toBeGreaterThan(0);
    for (const line of allLines) {
      const lower = line.text.toLowerCase();
      for (const keyword of FORBIDDEN_KEYWORDS) {
        expect(lower).not.toContain(keyword);
      }
    }
  });
});
