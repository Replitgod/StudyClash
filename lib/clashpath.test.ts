import { describe, expect, it } from "vitest";
import { buildClashPathReport, type ClashPathQuestionResult } from "./clashpath";

function fastCorrect(topic: string): ClashPathQuestionResult {
  return { topic, difficulty: "medium", isCorrect: true, responseTimeMs: 3000 };
}

describe("buildClashPathReport mastery status", () => {
  it("does not mark a topic mastered from a single correct answer, even with a perfect score and fast response", () => {
    const report = buildClashPathReport({
      deckId: "deck-1",
      currentAttempt: {
        accuracyPercent: 100,
        avgResponseTimeMs: 3000,
        questions: [fastCorrect("Algebra")],
      },
    });

    const algebra = report.topicInsights.find((t) => t.topic === "Algebra");
    expect(algebra?.status).not.toBe("mastered");
  });

  it("allows mastered status once enough lifetime attempts exist across current + historical matches", () => {
    const report = buildClashPathReport({
      deckId: "deck-1",
      currentAttempt: {
        accuracyPercent: 100,
        avgResponseTimeMs: 3000,
        questions: [fastCorrect("Algebra")],
      },
      historicalAttempts: [
        { accuracyPercent: 100, avgResponseTimeMs: 3000, questions: [fastCorrect("Algebra")] },
        { accuracyPercent: 100, avgResponseTimeMs: 3000, questions: [fastCorrect("Algebra")] },
      ],
    });

    const algebra = report.topicInsights.find((t) => t.topic === "Algebra");
    expect(algebra?.status).toBe("mastered");
  });
});
