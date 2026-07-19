// Pure, deterministic roast-line generator for the Results page. Every line
// is derived from real match stats already computed there (score, accuracy,
// streak, per-question response time, missed topics) -- never an LLM call,
// so it is structurally impossible for output to drift into a forbidden
// category (appearance, intelligence, disability, race, religion, gender,
// sexuality, body, family, financial status, academic accommodations, or
// any personal information). Same "deterministic > generative" philosophy
// as lib/mistakeBreakdown.ts and lib/studyPlanGenerator.ts.
//
// `seed` (pass the matchId) only selects which phrasing within an eligible
// template pool is used -- it never invents data. Same seed + same stats
// produces the same output every render/reload, so reloading the page
// doesn't make the roast flicker between different lines.

// Matches lib/mistakeBreakdown.ts's existing "slow_response" speed-trap
// threshold, so the two features agree on what counts as a slow answer.
export const SLOW_QUESTION_THRESHOLD_MS = 15000;

export type RoastQuestionSignal = {
  questionIndex: number; // 1-based, for "Question 4" style lines
  topic: string;
  difficulty: string;
  responseTimeMs: number;
  isCorrect: boolean;
};

export type RoastMatchStats = {
  scorePoints: number;
  accuracyPercent: number; // 0-100
  longestStreak: number;
  totalQuestions: number;
  correctAnswers: number;
  avgResponseMs: number;
  questions: RoastQuestionSignal[];
  missedTopics: { topic: string; missedCount: number }[];
};

export type RoastCategory = "weak_topic" | "slow_question" | "streak" | "accuracy" | "flawless";

export type RoastLine = {
  category: RoastCategory;
  text: string;
};

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pick<T>(pool: T[], seedKey: string): T {
  return pool[hashSeed(seedKey) % pool.length];
}

const FLAWLESS_TEMPLATES: (() => string)[] = [
  () => "Perfect run. Nothing to roast here -- go find someone else to challenge.",
  () => "100%. The AI has nothing on you this time.",
];

const WEAK_TOPIC_TEMPLATES: ((topic: string, missedCount: number) => string)[] = [
  (topic) => `${topic} won this round.`,
  (topic, missedCount) =>
    `${missedCount} question${missedCount === 1 ? "" : "s"} on ${topic} got the better of you.`,
  (topic) => `${topic} is undefeated against you so far.`,
];

const SLOW_QUESTION_TEMPLATES: ((seconds: number, questionIndex: number) => string)[] = [
  (seconds, questionIndex) => `You spent ${seconds} seconds negotiating with Question ${questionIndex}.`,
  (seconds, questionIndex) => `Question ${questionIndex} watched you think for ${seconds} seconds and still won.`,
  (seconds, questionIndex) => `${seconds} seconds on Question ${questionIndex} -- the clock noticed.`,
];

const STREAK_WITH_BREAK_TEMPLATES: ((streak: number, breakIndex: number) => string)[] = [
  (streak, breakIndex) => `Your streak disappeared faster than your confidence on Question ${breakIndex}.`,
  (streak, breakIndex) => `A ${streak}-streak, gone the moment Question ${breakIndex} showed up.`,
];

const STREAK_GENERIC_TEMPLATES: ((streak: number) => string)[] = [
  (streak) => `Your longest streak was ${streak} -- respectable, but it didn't last.`,
  (streak) => `${streak} in a row at best. The scoreboard remembers.`,
];

const ACCURACY_TEMPLATES: ((accuracyPercent: number) => string)[] = [
  (accuracyPercent) => `${accuracyPercent}% accuracy. The answers were just going in a different direction.`,
  (accuracyPercent) => `${accuracyPercent}% this round -- there's a rematch waiting for the redemption arc.`,
];

// Finds the question index that ended the best streak, so a streak line can
// reference the specific question the way the other categories do. Returns
// null if it can't be pinned to a specific miss (e.g. the streak ran to the
// end of the match with no follow-up miss) -- callers fall back to a
// generic streak line rather than fabricating a question reference.
function findStreakBreakIndex(questions: RoastQuestionSignal[], longestStreak: number): number | null {
  let current = 0;
  let best = 0;

  for (const question of questions) {
    if (question.isCorrect) {
      current++;
      best = Math.max(best, current);
    } else {
      if (current === best && best === longestStreak && best > 0) {
        return question.questionIndex;
      }
      current = 0;
    }
  }

  return null;
}

export function generateRoastLines(
  stats: RoastMatchStats,
  seed: string,
  options?: { maxLines?: number }
): RoastLine[] {
  const maxLines = options?.maxLines ?? 3;

  if (stats.totalQuestions === 0) return [];

  if (stats.correctAnswers === stats.totalQuestions) {
    return [{ category: "flawless", text: pick(FLAWLESS_TEMPLATES, `${seed}:flawless`)() }];
  }

  const candidates: RoastLine[] = [];

  if (stats.missedTopics.length > 0) {
    const topMissed = [...stats.missedTopics].sort((a, b) => b.missedCount - a.missedCount)[0];
    const template = pick(WEAK_TOPIC_TEMPLATES, `${seed}:weak_topic`);
    candidates.push({ category: "weak_topic", text: template(topMissed.topic, topMissed.missedCount) });
  }

  const slowQuestions = stats.questions.filter((q) => q.responseTimeMs >= SLOW_QUESTION_THRESHOLD_MS);
  if (slowQuestions.length > 0) {
    const slowest = slowQuestions.reduce((a, b) => (b.responseTimeMs > a.responseTimeMs ? b : a));
    const seconds = Math.round(slowest.responseTimeMs / 1000);
    const template = pick(SLOW_QUESTION_TEMPLATES, `${seed}:slow_question`);
    candidates.push({ category: "slow_question", text: template(seconds, slowest.questionIndex) });
  }

  if (stats.longestStreak >= 2) {
    const breakIndex = findStreakBreakIndex(stats.questions, stats.longestStreak);
    const text =
      breakIndex !== null
        ? pick(STREAK_WITH_BREAK_TEMPLATES, `${seed}:streak`)(stats.longestStreak, breakIndex)
        : pick(STREAK_GENERIC_TEMPLATES, `${seed}:streak`)(stats.longestStreak);
    candidates.push({ category: "streak", text });
  }

  const template = pick(ACCURACY_TEMPLATES, `${seed}:accuracy`);
  candidates.push({ category: "accuracy", text: template(stats.accuracyPercent) });

  const priority: RoastCategory[] = ["weak_topic", "slow_question", "streak", "accuracy"];
  const ordered = priority
    .map((category) => candidates.find((c) => c.category === category))
    .filter((c): c is RoastLine => Boolean(c));

  return ordered.slice(0, maxLines);
}
