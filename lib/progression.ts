// XP, levels, streaks and daily quests.
//
// The design constraint from section 17 is the important one: reward
// learning, not grinding. Every payout below is tied to something that
// actually moves a student forward -- recovering a mistake, completing a
// scheduled review, taking a weak topic up a tier -- and the flat
// per-question rate is deliberately small so that answering easy questions
// forever is the *worst* way to earn XP, not the best.
//
// Levels are cosmetic on purpose. Mastery is the number that means
// something; a level is just a readable summary of effort over time, and it
// must never be the thing a student optimises for.
//
// All pure, so the rules can be tested without a database.

/* ------------------------------------------------------------------- XP */

export type XpReason =
  | "question_answered"
  | "session_completed"
  | "mistake_recovered"
  | "review_completed"
  | "topic_improved"
  | "perfect_session"
  | "quest_completed"
  | "battle_won"
  | "streak_day";

export const XP_REASONS: Record<XpReason, { amount: number; label: string }> = {
  // Small on purpose. Volume alone should not be a route to a high level.
  question_answered: { amount: 2, label: "Question answered" },
  session_completed: { amount: 15, label: "Session finished" },
  // The single biggest per-event payout: fixing something you got wrong is
  // the behaviour most worth encouraging.
  mistake_recovered: { amount: 30, label: "Mistake fixed" },
  review_completed: { amount: 25, label: "Review done on time" },
  topic_improved: { amount: 40, label: "Topic improved" },
  perfect_session: { amount: 35, label: "Perfect session" },
  quest_completed: { amount: 50, label: "Quest complete" },
  battle_won: { amount: 20, label: "Battle won" },
  streak_day: { amount: 10, label: "Streak kept" },
};

/**
 * XP needed to *reach* a given level.
 *
 * Quadratic, so levels slow down steadily rather than stopping dead. Level
 * 2 costs 100, level 10 about 4,000, level 50 about 120,000 -- reachable by
 * a committed student across a school year, not in a weekend.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 50 * n * (n + 1);
}

export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  // Inverse of the quadratic above, floored.
  const n = Math.floor((-1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 50)) / 2);
  return Math.max(1, n + 1);
}

export type LevelProgress = {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level spans in total. */
  xpForThisLevel: number;
  /** 0-100. */
  percent: number;
  xpToNextLevel: number;
};

export function levelProgress(xp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = levelForXp(safeXp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  const into = Math.max(0, safeXp - floor);

  return {
    level,
    xpIntoLevel: into,
    xpForThisLevel: span,
    percent: Math.min(100, Math.round((into / span) * 100)),
    xpToNextLevel: Math.max(0, ceiling - safeXp),
  };
}

/* --------------------------------------------------------------- streaks */

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  /** ISO date (YYYY-MM-DD) of the last day with real study activity. */
  lastActiveOn: string | null;
  streakFreezes: number;
};

export type StreakUpdate = StreakState & {
  /** True when this activity extended the streak (worth telling them). */
  extended: boolean;
  /** True when a freeze was spent to cover a missed day. */
  usedFreeze: boolean;
  /** True when the streak reset. */
  broken: boolean;
};

/** Whole days between two ISO dates. Negative if `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** A freeze is earned every this many consecutive days, capped below. */
const FREEZE_EARNED_EVERY = 5;
const MAX_FREEZES = 3;

/**
 * Advances the streak for a day of real study.
 *
 * Two decisions matter here, both from section 19. Studying twice in one
 * day does not count twice -- a streak measures days, not sessions. And a
 * single missed day is covered by a freeze if one has been earned, so a
 * month of consistency is not destroyed by one bad Tuesday. Beyond that the
 * streak does reset, because a streak that cannot break is not a streak.
 */
export function advanceStreak(state: StreakState, today: string): StreakUpdate {
  const base = {
    ...state,
    extended: false,
    usedFreeze: false,
    broken: false,
  };

  if (!state.lastActiveOn) {
    return {
      ...base,
      currentStreak: 1,
      longestStreak: Math.max(1, state.longestStreak),
      lastActiveOn: today,
      extended: true,
    };
  }

  const gap = daysBetween(state.lastActiveOn, today);

  // Same day, or a clock that has gone backwards: nothing changes.
  if (gap <= 0) return base;

  if (gap === 1) {
    const currentStreak = state.currentStreak + 1;
    const earnedFreeze =
      currentStreak % FREEZE_EARNED_EVERY === 0 && state.streakFreezes < MAX_FREEZES;

    return {
      ...base,
      currentStreak,
      longestStreak: Math.max(currentStreak, state.longestStreak),
      lastActiveOn: today,
      streakFreezes: earnedFreeze ? state.streakFreezes + 1 : state.streakFreezes,
      extended: true,
    };
  }

  // Exactly one missed day, and a freeze in hand: spend it and carry on.
  if (gap === 2 && state.streakFreezes > 0) {
    const currentStreak = state.currentStreak + 1;
    return {
      ...base,
      currentStreak,
      longestStreak: Math.max(currentStreak, state.longestStreak),
      lastActiveOn: today,
      streakFreezes: state.streakFreezes - 1,
      extended: true,
      usedFreeze: true,
    };
  }

  return {
    ...base,
    currentStreak: 1,
    longestStreak: Math.max(1, state.longestStreak),
    lastActiveOn: today,
    broken: true,
    extended: true,
  };
}

/** Today as an ISO date in the *reader's* timezone, not UTC. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* ---------------------------------------------------------------- quests */

export type QuestKey =
  | "daily_training"
  | "comeback"
  | "consistency"
  | "competitor";

export type QuestDefinition = {
  key: QuestKey;
  title: string;
  /** What the student has to do, in their words. */
  description: string;
  target: number;
};

/**
 * The four daily quests.
 *
 * Each maps to a different worthwhile behaviour rather than four flavours
 * of "do more". `comeback` and `consistency` in particular are things a
 * student would not choose on their own but benefit most from.
 */
export const QUEST_CATALOGUE: Record<QuestKey, QuestDefinition> = {
  daily_training: {
    key: "daily_training",
    title: "Daily training",
    description: "Answer 20 questions",
    target: 20,
  },
  comeback: {
    key: "comeback",
    title: "Comeback",
    description: "Fix 3 mistakes",
    target: 3,
  },
  consistency: {
    key: "consistency",
    title: "Consistency",
    description: "Clear today's reviews",
    target: 1,
  },
  competitor: {
    key: "competitor",
    title: "Competitor",
    description: "Win 2 battles",
    target: 2,
  },
};

export type QuestProgress = {
  key: QuestKey;
  title: string;
  description: string;
  progress: number;
  target: number;
  isComplete: boolean;
  percent: number;
};

export function questProgress(
  key: QuestKey,
  progress: number
): QuestProgress {
  const definition = QUEST_CATALOGUE[key];
  const clamped = Math.max(0, Math.min(definition.target, Math.floor(progress)));
  return {
    key,
    title: definition.title,
    description: definition.description,
    progress: clamped,
    target: definition.target,
    isComplete: clamped >= definition.target,
    percent: Math.round((clamped / definition.target) * 100),
  };
}

/**
 * Which quests to offer today.
 *
 * `competitor` is only offered once a student has actually battled: a quest
 * you cannot complete is a quest that teaches you the quests are noise.
 */
export function questsForToday(args: {
  hasReviewsDue: boolean;
  hasBattled: boolean;
}): QuestKey[] {
  const quests: QuestKey[] = ["daily_training", "comeback"];
  if (args.hasReviewsDue) quests.push("consistency");
  if (args.hasBattled) quests.push("competitor");
  return quests;
}
