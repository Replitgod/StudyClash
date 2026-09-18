// Pure logic behind a study session: how topics are matched, how a session
// is scored, and what the student is told at the end.
//
// Which questions get asked, and in what order, now lives in
// lib/adaptiveSession.ts -- selection stopped being "the first N rows" and
// became a real decision driven by mastery.
//
// Kept out of the component so it can be tested directly -- these rules
// decide what a student actually practices, and getting them wrong is
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
  /** Why each wrong option is wrong, keyed by option text. Newer decks only. */
  choice_feedback?: Record<string, string> | null;
};

export type Confidence = "sure" | "unsure" | "guess";

export type SessionAnswer = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
  /** How sure the student said they were, before seeing the answer. */
  confidence?: Confidence;
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

/* ------------------------------------------------------------ calibration */

export type Calibration = {
  /** Answers given with each confidence, and how many of those were right. */
  sure: { right: number; total: number };
  unsure: { right: number; total: number };
  guess: { right: number; total: number };
  /** Topics answered wrong while sure: misconceptions, not slips. */
  confidentMissTopics: string[];
  /** Topics answered right on a guess: not known yet, just lucky. */
  luckyTopics: string[];
};

/**
 * How well the student's confidence matched their answers.
 *
 * This is the metacognition half of the session. A student who is sure and
 * wrong holds a misconception and will not go looking for it; a student who
 * guesses right thinks they know it. Neither shows up in a percentage.
 */
export function calibration(args: {
  questions: SessionQuestion[];
  answers: SessionAnswer[];
}): Calibration {
  const topicById = new Map(args.questions.map((q) => [q.id, (q.topic || "General").trim()]));
  const result: Calibration = {
    sure: { right: 0, total: 0 },
    unsure: { right: 0, total: 0 },
    guess: { right: 0, total: 0 },
    confidentMissTopics: [],
    luckyTopics: [],
  };

  for (const answer of args.answers) {
    if (!answer.confidence) continue;
    const bucket = result[answer.confidence];
    bucket.total += 1;
    if (answer.isCorrect) bucket.right += 1;
    const topic = topicById.get(answer.questionId) || "General";
    if (answer.confidence === "sure" && !answer.isCorrect && !result.confidentMissTopics.includes(topic)) {
      result.confidentMissTopics.push(topic);
    }
    if (answer.confidence === "guess" && answer.isCorrect && !result.luckyTopics.includes(topic)) {
      result.luckyTopics.push(topic);
    }
  }

  return result;
}

/** One plain sentence about calibration, or null when there is nothing to say. */
export function describeCalibration(c: Calibration): string | null {
  const rated = c.sure.total + c.unsure.total + c.guess.total;
  if (rated < 3) return null;
  if (c.sure.total > 0 && c.sure.right === c.sure.total && c.confidentMissTopics.length === 0) {
    return `When you were sure, you were right: ${c.sure.right} of ${c.sure.total}.`;
  }
  if (c.confidentMissTopics.length > 0) {
    const wrong = c.sure.total - c.sure.right;
    return `You were sure about ${wrong} answer${wrong === 1 ? "" : "s"} you got wrong. Those are misconceptions, so they come back first.`;
  }
  if (c.guess.right > 0) {
    return `You guessed right ${c.guess.right} time${c.guess.right === 1 ? "" : "s"}. Those come back soon, because a lucky guess is not knowing it.`;
  }
  return null;
}

/* --------------------------------------------------------------- resuming */

/**
 * An unfinished session, as saved in the browser.
 *
 * Refreshing the page, a phone locking, or tapping a link mid-session used to
 * throw every answer away: the state lived only in React. It is now written
 * to localStorage after every answer and picked back up on return.
 */
export type SavedSession = {
  version: 1;
  deckId: string;
  /** The URL query the session was started with, so a different session does not resume it. */
  scope: string;
  /** Question ids in the order they are being asked, retries included (as "id#retry"). */
  order: string[];
  index: number;
  answers: SessionAnswer[];
  recoveredIds: string[];
  startedAt: number;
  savedAt: number;
};

/** Sessions older than this start fresh: the student has moved on. */
export const RESUME_WINDOW_MS = 12 * 60 * 60 * 1000;

export function sessionStorageKey(deckId: string): string {
  return `acedecks_session_${deckId}`;
}

/**
 * Reads a saved session back, or null if it is missing, stale, for a
 * different session, or no longer matches the deck's questions.
 */
export function restoreSession(args: {
  raw: string | null;
  deckId: string;
  scope: string;
  questionIds: Set<string>;
  now: number;
}): SavedSession | null {
  if (!args.raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const saved = parsed as Partial<SavedSession>;

  if (saved.version !== 1 || saved.deckId !== args.deckId || saved.scope !== args.scope) return null;
  if (typeof saved.savedAt !== "number" || args.now - saved.savedAt > RESUME_WINDOW_MS) return null;
  if (!Array.isArray(saved.order) || saved.order.length === 0) return null;
  if (!Array.isArray(saved.answers) || !Array.isArray(saved.recoveredIds)) return null;
  if (typeof saved.index !== "number" || saved.index < 0 || saved.index >= saved.order.length) return null;
  if (saved.answers.length === 0) return null;

  // Every question must still exist: a regenerated or edited deck makes
  // the saved order meaningless.
  const baseIds = saved.order.map((key) => key.replace(/#retry$/, ""));
  if (!baseIds.every((id) => args.questionIds.has(id))) return null;

  const answers = saved.answers.filter(
    (a) =>
      a &&
      typeof a.questionId === "string" &&
      args.questionIds.has(a.questionId) &&
      typeof a.selectedAnswer === "string" &&
      typeof a.isCorrect === "boolean" &&
      typeof a.responseTimeMs === "number"
  );
  if (answers.length !== saved.answers.length) return null;

  return {
    version: 1,
    deckId: args.deckId,
    scope: args.scope,
    order: saved.order,
    index: saved.index,
    answers,
    recoveredIds: saved.recoveredIds.filter((id): id is string => typeof id === "string"),
    startedAt: typeof saved.startedAt === "number" ? saved.startedAt : saved.savedAt,
    savedAt: saved.savedAt,
  };
}
