import { describe, expect, it } from "vitest";
import {
  calibration,
  describeCalibration,
  restoreSession,
  RESUME_WINDOW_MS,
  normalizeTopicKey,
  parseTopics,
  scoreFor,
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

describe("calibration", () => {
  const questions = [
    { id: "1", question_text: "", answer_choices: [], correct_answer: "", explanation: null, topic: "Acids", difficulty: null },
    { id: "2", question_text: "", answer_choices: [], correct_answer: "", explanation: null, topic: "Bases", difficulty: null },
    { id: "3", question_text: "", answer_choices: [], correct_answer: "", explanation: null, topic: "Salts", difficulty: null },
  ];
  const answer = (questionId: string, isCorrect: boolean, confidence?: "sure" | "unsure" | "guess") => ({
    questionId,
    selectedAnswer: "x",
    isCorrect,
    responseTimeMs: 1000,
    confidence,
  });

  it("names confident misses and lucky guesses by topic", () => {
    const c = calibration({
      questions,
      answers: [answer("1", false, "sure"), answer("2", true, "guess"), answer("3", true, "sure")],
    });
    expect(c.sure).toEqual({ right: 1, total: 2 });
    expect(c.confidentMissTopics).toEqual(["Acids"]);
    expect(c.luckyTopics).toEqual(["Bases"]);
    expect(describeCalibration(c)).toMatch(/sure about 1 answer you got wrong/);
  });

  it("says nothing until enough answers were rated", () => {
    const c = calibration({ questions, answers: [answer("1", true, "sure"), answer("2", true)] });
    expect(describeCalibration(c)).toBeNull();
  });

  it("praises good calibration plainly", () => {
    const c = calibration({
      questions,
      answers: [answer("1", true, "sure"), answer("2", true, "sure"), answer("3", false, "unsure")],
    });
    expect(describeCalibration(c)).toBe("When you were sure, you were right: 2 of 2.");
  });
});

describe("restoreSession", () => {
  const NOW = 1_800_000_000_000;
  const ids = new Set(["a", "b", "c"]);
  const saved = {
    version: 1,
    deckId: "deck",
    scope: "limit=10",
    order: ["a", "b", "a#retry", "c"],
    index: 2,
    answers: [
      { questionId: "a", selectedAnswer: "x", isCorrect: false, responseTimeMs: 900 },
      { questionId: "b", selectedAnswer: "y", isCorrect: true, responseTimeMs: 1200 },
    ],
    recoveredIds: [],
    startedAt: NOW - 60_000,
    savedAt: NOW - 30_000,
  };
  const restore = (raw: unknown, overrides: Partial<{ scope: string; now: number; questionIds: Set<string> }> = {}) =>
    restoreSession({
      raw: typeof raw === "string" ? raw : JSON.stringify(raw),
      deckId: "deck",
      scope: overrides.scope ?? "limit=10",
      questionIds: overrides.questionIds ?? ids,
      now: overrides.now ?? NOW,
    });

  it("restores a recent session for the same deck and scope", () => {
    expect(restore(saved)?.index).toBe(2);
  });

  it("refuses a stale, different, corrupt or outdated session", () => {
    expect(restore(saved, { now: NOW + RESUME_WINDOW_MS })).toBeNull();
    expect(restore(saved, { scope: "topics=acids" })).toBeNull();
    expect(restore("{not json")).toBeNull();
    expect(restore(saved, { questionIds: new Set(["a", "b"]) })).toBeNull();
    expect(restore({ ...saved, answers: [] })).toBeNull();
    expect(restore({ ...saved, index: 9 })).toBeNull();
  });
});
