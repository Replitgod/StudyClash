// Adaptive training: which questions a session asks, in what order, and how
// it responds to how the session is actually going.
//
// The old selection was `matched.slice(0, limit)` -- the first N questions
// in whatever order the database returned them. A student asking for a
// 10-question session on their weakest material got 10 arbitrary questions,
// which is indistinguishable from a shuffle and wastes the one thing that
// makes AcedIQ different: it already knows what they do not know.
//
// Two separate jobs live here:
//
//   planSession      picks and orders the questions before the session
//                    starts, from mastery state and per-question history
//   adaptDifficulty  reacts during the session -- push harder when they are
//                    dominating, ease off and diagnose when they are not
//
// Both are pure. A bug in either does not throw, it just quietly makes the
// student practise the wrong things, so they are tested directly.

import type { SessionQuestion } from "@/lib/studySession";
import { normalizeTopicKey } from "@/lib/studySession";

/* ----------------------------------------------------------- difficulty */

export type DifficultyBand = "easy" | "medium" | "hard";

// The generated data uses at least 'easy' | 'medium' | 'hard' | 'beginner',
// in mixed casing, across several generations of the question writer. A
// question whose difficulty does not parse must not silently become "easy"
// and get handed to a struggling student as a win, so anything unrecognised
// is treated as medium.
const DIFFICULTY_ALIASES: Record<string, DifficultyBand> = {
  easy: "easy",
  beginner: "easy",
  basic: "easy",
  intro: "easy",
  introductory: "easy",
  simple: "easy",
  "1": "easy",
  medium: "medium",
  intermediate: "medium",
  moderate: "medium",
  standard: "medium",
  "2": "medium",
  "3": "medium",
  hard: "hard",
  advanced: "hard",
  challenge: "hard",
  challenging: "hard",
  difficult: "hard",
  expert: "hard",
  "4": "hard",
  "5": "hard",
};

export function difficultyBand(raw: string | null | undefined): DifficultyBand {
  if (!raw) return "medium";
  return DIFFICULTY_ALIASES[String(raw).trim().toLowerCase()] ?? "medium";
}

/** 0 easy .. 1 hard, the scale lib/mastery.ts scores attempts against. */
export function difficultyValue(raw: string | null | undefined): number {
  const band = difficultyBand(raw);
  return band === "easy" ? 0 : band === "hard" ? 1 : 0.5;
}

/* -------------------------------------------------------------- planning */

export type TopicPriority = {
  /** Normalised topic key, as produced by normalizeTopicKey. */
  topic: string;
  /** Higher = more worth practising. From opportunityScore in lib/mastery. */
  priority: number;
  /** Due for review right now. */
  isDue: boolean;
};

export type QuestionHistory = {
  questionId: string;
  /** Consecutive correct answers. 0 means it was missed last time. */
  correctStreak: number;
  /** True when this specific question is scheduled for review. */
  isDue: boolean;
};

export type SessionPlan = {
  questions: SessionQuestion[];
  /** True when topic narrowing matched nothing and the whole set was used. */
  didFallBack: boolean;
  /** Why this session looks the way it does, for the student. */
  rationale: string;
};

// A question the student has never seen is worth more than one they have
// already answered correctly three times, but less than one they missed.
function historyWeight(history: QuestionHistory | undefined): number {
  if (!history) return 1; // Never seen.
  if (history.correctStreak === 0) return 2.2; // Missed last time.
  if (history.isDue) return 1.6; // Known, but fading.
  // Each clean repetition makes it less urgent, to a floor.
  return Math.max(0.15, 1 / (1 + history.correctStreak));
}

/**
 * Picks and orders the questions for one session.
 *
 * Ordering is not purely "hardest first" or "weakest first". It opens with
 * something winnable so the session starts with momentum rather than a
 * wall, front-loads what actually needs work, and keeps the highest-value
 * items early enough that a student who quits halfway still practised the
 * things that mattered most.
 */
export function planSession(args: {
  questions: SessionQuestion[];
  /** Normalised topic keys the student asked to narrow to. */
  topics: string[];
  limit: number | null;
  topicPriorities?: TopicPriority[];
  history?: QuestionHistory[];
}): SessionPlan {
  const { questions, topics, limit } = args;

  let pool = questions;
  let didFallBack = false;

  if (topics.length > 0) {
    const matched = questions.filter((question) => {
      const key = normalizeTopicKey(question.topic || "");
      if (!key) return false;
      return topics.some(
        (topic) => key === topic || key.includes(topic) || topic.includes(key)
      );
    });

    // Best-effort narrowing, as before: a renamed or regenerated topic
    // should give the student the whole set, not an empty session.
    if (matched.length > 0) pool = matched;
    else didFallBack = true;
  }

  const priorityByTopic = new Map(
    (args.topicPriorities || []).map((t) => [t.topic, t])
  );
  const historyById = new Map(
    (args.history || []).map((h) => [h.questionId, h])
  );

  const scored = pool.map((question, originalIndex) => {
    const key = normalizeTopicKey(question.topic || "");
    const topicState = priorityByTopic.get(key);
    const history = historyById.get(question.id);

    // Topic urgency, question urgency, multiplied -- a question the student
    // keeps missing inside a topic they are weak at is the single most
    // valuable thing the session can ask.
    const topicWeight = topicState ? 0.4 + topicState.priority * 1.6 : 1;
    const score = topicWeight * historyWeight(history);

    return { question, score, originalIndex, difficulty: difficultyValue(question.difficulty) };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable within equal scores so a session is reproducible.
    return a.originalIndex - b.originalIndex;
  });

  const take = limit && limit > 0 ? Math.min(limit, scored.length) : scored.length;
  const selected = scored.slice(0, take);

  // Open with the most winnable of the first few rather than the hardest
  // thing in the set. Starting a weak-topic session with its hardest
  // question is how a student decides they are bad at the subject and
  // stops, which costs more than the question was worth.
  if (selected.length > 2) {
    const openerWindow = selected.slice(0, Math.min(4, selected.length));
    let easiestAt = 0;
    for (let i = 1; i < openerWindow.length; i += 1) {
      if (openerWindow[i].difficulty < openerWindow[easiestAt].difficulty) easiestAt = i;
    }
    if (easiestAt !== 0) {
      const [opener] = selected.splice(easiestAt, 1);
      selected.unshift(opener);
    }
  }

  return {
    questions: selected.map((entry) => entry.question),
    didFallBack,
    rationale: describePlan({
      count: selected.length,
      narrowed: topics.length > 0 && !didFallBack,
      hasPriorities: priorityByTopic.size > 0,
      missedCount: selected.filter(
        (entry) => historyById.get(entry.question.id)?.correctStreak === 0
      ).length,
    }),
  };
}

function describePlan(args: {
  count: number;
  narrowed: boolean;
  hasPriorities: boolean;
  missedCount: number;
}): string {
  const { count, narrowed, missedCount } = args;
  if (count === 0) return "No questions available.";
  if (missedCount > 0) {
    return `${count} questions, starting with the ${missedCount} you missed last time.`;
  }
  if (narrowed) return `${count} questions on what you asked for.`;
  return `${count} questions, weakest material first.`;
}

/* -------------------------------------------------------------- adapting */

export type AdaptiveState = {
  /** Where the session is aiming right now. */
  target: DifficultyBand;
  /** Consecutive correct answers. */
  streak: number;
  /** Consecutive misses. */
  missStreak: number;
  /**
   * Topics missed more than once this session. These are worth pausing on
   * rather than moving past -- a second miss on the same topic is a gap,
   * not a slip.
   */
  strugglingTopics: string[];
};

export const INITIAL_ADAPTIVE_STATE: AdaptiveState = {
  target: "medium",
  streak: 0,
  missStreak: 0,
  strugglingTopics: [],
};

const HARDER: Record<DifficultyBand, DifficultyBand> = {
  easy: "medium",
  medium: "hard",
  hard: "hard",
};

const EASIER: Record<DifficultyBand, DifficultyBand> = {
  hard: "medium",
  medium: "easy",
  easy: "easy",
};

/**
 * Reacts to one answer.
 *
 * Deliberately asymmetric: it takes three correct answers to earn a step up
 * but only two misses to step down. Being pushed too hard makes a student
 * quit; being asked something slightly too easy costs them a few seconds.
 * The downside risks are not the same size, so the thresholds are not
 * either.
 */
export function adaptDifficulty(
  state: AdaptiveState,
  outcome: { isCorrect: boolean; topic: string | null }
): AdaptiveState {
  const topicKey = normalizeTopicKey(outcome.topic || "");

  if (outcome.isCorrect) {
    const streak = state.streak + 1;
    return {
      ...state,
      streak,
      missStreak: 0,
      target: streak >= 3 ? HARDER[state.target] : state.target,
    };
  }

  const missStreak = state.missStreak + 1;

  // A topic already missed once this session and missed again is a genuine
  // gap. Recorded so the session can prioritise it rather than move on.
  const alreadyStruggling = state.strugglingTopics.includes(topicKey);
  const missedBefore = state.strugglingTopics.length > 0 || state.missStreak > 0;
  const strugglingTopics =
    topicKey && !alreadyStruggling && missedBefore
      ? [...state.strugglingTopics, topicKey]
      : state.strugglingTopics;

  return {
    target: missStreak >= 2 ? EASIER[state.target] : state.target,
    streak: 0,
    missStreak,
    strugglingTopics,
  };
}

/**
 * Reorders what is left of the session to match where the student now is.
 *
 * Called after each answer, so a session that opened at medium and found
 * the student flying stops wasting their time, and one that found them
 * struggling stops compounding it.
 */
export function reorderRemaining(
  remaining: SessionQuestion[],
  state: AdaptiveState
): SessionQuestion[] {
  if (remaining.length < 2) return remaining;

  const targetValue =
    state.target === "easy" ? 0 : state.target === "hard" ? 1 : 0.5;

  return remaining
    .map((question, index) => {
      const distance = Math.abs(difficultyValue(question.difficulty) - targetValue);
      const topicKey = normalizeTopicKey(question.topic || "");
      // Pull a struggling topic forward: teach it now, while the
      // explanation they just read is still in mind.
      const strugglingBoost = state.strugglingTopics.includes(topicKey) ? -1 : 0;
      return { question, rank: distance + strugglingBoost, index };
    })
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index))
    .map((entry) => entry.question);
}
