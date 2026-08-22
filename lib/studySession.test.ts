import { describe, expect, it } from "vitest";
import {
  normalizeTopicKey,
  parseTopics,
  scoreFor,
  selectQuestions,
  summarize,
  type SessionAnswer,
  type SessionQuestion,
} from "./studySession";

function question(
  id: string,
  topic: string,
  overrides: Partial<SessionQuestion> = {}
): SessionQuestion {
  return {
    id,
    question_text: `Question ${id}`,
    answer_choices: ["A", "B", "C", "D"],
    correct_answer: "A",
    explanation: "Because.",
    topic,
    difficulty: "medium",
    ...overrides,
  };
}

function answer(questionId: string, isCorrect: boolean): SessionAnswer {
  return { questionId, selectedAnswer: isCorrect ? "A" : "B", isCorrect, responseTimeMs: 1000 };
}

describe("parseTopics", () => {
  it("reads nothing from an absent parameter", () => {
    expect(parseTopics(null)).toEqual([]);
    expect(parseTopics("")).toEqual([]);
  });

  it("splits and decodes each topic independently", () => {
    expect(parseTopics("Safavid%20Empire,Gunpowder")).toEqual([
      "safavid empire",
      "gunpowder",
    ]);
  });

  it("survives a malformed escape sequence instead of throwing", () => {
    // decodeURIComponent("%E0%A4%A") throws. A bad link should narrow the
    // session badly, not crash the page.
    expect(() => parseTopics("%E0%A4%A")).not.toThrow();
  });
});

describe("normalizeTopicKey", () => {
  it("ignores case, punctuation, and spacing", () => {
    expect(normalizeTopicKey("  The Safavid-Empire!  ")).toBe("the safavid empire");
  });
});

describe("selectQuestions", () => {
  const questions = [
    question("1", "Safavid Empire"),
    question("2", "Gunpowder Technology"),
    question("3", "Mughal Architecture"),
  ];

  it("returns everything when nothing is narrowed", () => {
    const result = selectQuestions({ questions, topics: [], limit: null });
    expect(result.questions).toHaveLength(3);
    expect(result.didFallBack).toBe(false);
  });

  it("narrows to the requested topics", () => {
    const result = selectQuestions({
      questions,
      topics: ["safavid empire"],
      limit: null,
    });
    expect(result.questions.map((q) => q.id)).toEqual(["1"]);
  });

  it("matches a topic by partial overlap, not just exact equality", () => {
    // Topic labels drift between generations ("Gunpowder" vs "Gunpowder
    // Technology"); an exact-match-only rule would silently return nothing.
    const result = selectQuestions({ questions, topics: ["gunpowder"], limit: null });
    expect(result.questions.map((q) => q.id)).toEqual(["2"]);
  });

  it("falls back to the full set rather than an empty session", () => {
    const result = selectQuestions({
      questions,
      topics: ["nothing like this"],
      limit: null,
    });
    expect(result.questions).toHaveLength(3);
    expect(result.didFallBack).toBe(true);
  });

  it("applies the limit after narrowing", () => {
    const result = selectQuestions({ questions, topics: [], limit: 2 });
    expect(result.questions).toHaveLength(2);
  });

  it("ignores a question with no topic when topics were requested", () => {
    const result = selectQuestions({
      questions: [question("1", ""), question("2", "Safavid Empire")],
      topics: ["safavid empire"],
      limit: null,
    });
    expect(result.questions.map((q) => q.id)).toEqual(["2"]);
  });
});

describe("scoreFor", () => {
  // Must stay in step with computeAuthoritativeScore in
  // app/api/battle/finish/route.ts, which is what actually gets saved.
  it("scores nothing for an empty session", () => {
    expect(scoreFor([])).toBe(0);
  });

  it("pays a flat rate below a three-streak", () => {
    expect(scoreFor([answer("1", true), answer("2", true)])).toBe(200);
  });

  it("pays a bonus from the third correct answer in a row", () => {
    // 100 + 100 + (100 + 25).
    expect(scoreFor([answer("1", true), answer("2", true), answer("3", true)])).toBe(325);
  });

  it("raises the bonus again at a five-streak", () => {
    // 100 + 100 + 125 + 125 + (100 + 50).
    const answers = ["1", "2", "3", "4", "5"].map((id) => answer(id, true));
    expect(scoreFor(answers)).toBe(600);
  });

  it("resets the streak on a wrong answer", () => {
    const answers = [
      answer("1", true),
      answer("2", true),
      answer("3", false),
      answer("4", true),
    ];
    expect(scoreFor(answers)).toBe(300);
  });
});

describe("summarize", () => {
  const questions = [
    question("1", "Safavid Empire"),
    question("2", "Safavid Empire"),
    question("3", "Gunpowder"),
  ];

  it("reports an accurate percentage", () => {
    const result = summarize({
      questions,
      answers: [answer("1", true), answer("2", true), answer("3", false)],
    });
    expect(result.correct).toBe(2);
    expect(result.total).toBe(3);
    expect(result.percent).toBe(67);
  });

  it("only calls a topic strong when every question on it was right", () => {
    const result = summarize({
      questions,
      answers: [answer("1", true), answer("2", false), answer("3", true)],
    });
    expect(result.strong.map((r) => r.topic)).toEqual(["Gunpowder"]);
    expect(result.review.map((r) => r.topic)).toEqual(["Safavid Empire"]);
  });

  it("puts the worst topic first in the review list", () => {
    const result = summarize({
      questions,
      answers: [answer("1", false), answer("2", true), answer("3", false)],
    });
    // Gunpowder is 0/1, Safavid is 1/2.
    expect(result.review.map((r) => r.topic)).toEqual(["Gunpowder", "Safavid Empire"]);
  });

  it("handles a session with no answers", () => {
    const result = summarize({ questions, answers: [] });
    expect(result.percent).toBe(0);
    expect(result.strong).toEqual([]);
    expect(result.review).toEqual([]);
  });
});
