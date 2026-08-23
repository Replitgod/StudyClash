// Pure logic behind a study session: how topics are matched, how a session
// is scored, and what the student is told at the end.
//
// Which questions get asked, and in what order, now lives in
// lib/adaptiveSession.ts -- selection stopped being "the first N rows" and
// became a real decision driven by mastery.
//
// Kept out of the component so it can be tested directly -- these rules
// decide what a student actually practises, and getting them wrong is
// invisible in the UI (the session still "works", it just asks the wrong
// questions).

export type SessionQuestion = {
  id: string;
  question_text: string;
  answer_choices: string[];
  correct_answer: string;
  explanation: string | null;
  topic: string | null;
  difficulty: string | null;
  question_type?: string | null;
};

export type SessionAnswer = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
};

// Matches normalizeTopicKey in app/battle/[deckId]/page.tsx so a link built
// for one session screen selects the same questions on the other.
export function normalizeTopicKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads the comma-separated, individually-encoded `topics` query value. */
export function parseTopics(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((topic) => {
      try {
        return normalizeTopicKey(decodeURIComponent(topic));
      } catch {
        // A malformed escape sequence should narrow the session, not crash it.
        return normalizeTopicKey(topic);
      }
    })
    .filter(Boolean);
}

// The same streak scoring the server recomputes in
// app/api/battle/finish/route.ts. Duplicated here only so the number shown
// on screen matches the one that gets saved; the server never trusts this.
const BASE_POINTS_PER_CORRECT = 100;
const STREAK_BONUS_TIER_1 = 25;
const STREAK_BONUS_TIER_2 = 50;

export function scoreFor(answers: SessionAnswer[]): number {
  let streak = 0;
  let score = 0;

  for (const answer of answers) {
    if (answer.isCorrect) {
      streak += 1;
      score +=
        streak >= 5
          ? BASE_POINTS_PER_CORRECT + STREAK_BONUS_TIER_2
          : streak >= 3
            ? BASE_POINTS_PER_CORRECT + STREAK_BONUS_TIER_1
            : BASE_POINTS_PER_CORRECT;
    } else {
      streak = 0;
    }
  }

  return score;
}

export type TopicResult = { topic: string; correct: number; total: number };

/**
 * What to tell the student afterwards. Not "7/10" -- which topics held up
 * and which ones did not.
 */
export function summarize(args: {
  questions: SessionQuestion[];
  answers: SessionAnswer[];
}): {
  correct: number;
  total: number;
  percent: number;
  strong: TopicResult[];
  review: TopicResult[];
} {
  const { questions, answers } = args;
  const topicById = new Map(questions.map((q) => [q.id, (q.topic || "General").trim()]));

  const byTopic = new Map<string, TopicResult>();
  for (const answer of answers) {
    const topic = topicById.get(answer.questionId) || "General";
    const entry = byTopic.get(topic) || { topic, correct: 0, total: 0 };
    entry.total += 1;
    if (answer.isCorrect) entry.correct += 1;
    byTopic.set(topic, entry);
  }

  const results = Array.from(byTopic.values());
  const correct = answers.filter((a) => a.isCorrect).length;
  const total = answers.length;

  return {
    correct,
    total,
    percent: total > 0 ? Math.round((correct / total) * 100) : 0,
    // A topic counts as strong only when every question on it was right --
    // "strong at X" after getting one of two wrong is not a claim worth
    // making to someone revising for an exam.
    strong: results
      .filter((r) => r.correct === r.total)
      .sort((a, b) => b.total - a.total),
    review: results
      .filter((r) => r.correct < r.total)
      .sort((a, b) => a.correct / a.total - b.correct / b.total),
  };
}
