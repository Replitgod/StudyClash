export type DeckAttemptRecord = {
  score: number;
  accuracy: number;
  matchId: string;
  timestamp: string;
};

export type BattleHistoryEntry = {
  matchId: string;
  deckId: string;
  deckTitle?: string;
  score: number;
  accuracy: number;
  mode: string;
  createdAt: string;
};

export type ProgressSnapshot = {
  totalXp: number;
  awardedMatchIds: string[];
  bestScoresByDeck: Record<string, DeckAttemptRecord>;
  lastAttemptsByDeck: Record<string, DeckAttemptRecord>;
  bossAwardedMatchIds: string[];
  bossBadges: string[];
  battleHistory: BattleHistoryEntry[];
  currentStreakDays: number;
  bestStreakDays: number;
  lastBattleDate: string | null;
  unlockedAchievementIds: string[];
};

export type RankInfo = {
  label: string;
  tier: number;
};

export type SeasonProgress = {
  seasonNumber: number;
  seasonXp: number;
  seasonXpTarget: number;
  progressPercent: number;
  checkpointsCleared: number;
};

export const DAILY_GOAL_BATTLES = 2;
export const WEEKLY_GOAL_BATTLES = 8;
export const WEEKLY_GOAL_AVG_ACCURACY = 72;
export const SEASON_XP_TARGET = 5000;

const GLOBAL_MILESTONES = [500, 1200, 2500, 4000, 6000, 9000, 12000, 16000, 22000];

function defaultSnapshot(): ProgressSnapshot {
  return {
    totalXp: 0,
    awardedMatchIds: [],
    bestScoresByDeck: {},
    lastAttemptsByDeck: {},
    bossAwardedMatchIds: [],
    bossBadges: [],
    battleHistory: [],
    currentStreakDays: 0,
    bestStreakDays: 0,
    lastBattleDate: null,
    unlockedAchievementIds: [],
  };
}

function normalizeProgressScope(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getProgressStorageKey(args: {
  userId?: string | null;
  playerName?: string | null;
}): string {
  const scope = args.userId
    ? `user:${args.userId}`
    : `player:${normalizeProgressScope(args.playerName || "guest")}`;

  return `studyclash-progression:v1:${scope}`;
}

export function loadProgressSnapshot(storageKey: string): ProgressSnapshot {
  if (typeof window === "undefined") {
    return defaultSnapshot();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultSnapshot();

    const parsed = JSON.parse(raw) as Partial<ProgressSnapshot>;

    return {
      totalXp: parsed.totalXp || 0,
      awardedMatchIds: parsed.awardedMatchIds || [],
      bestScoresByDeck: parsed.bestScoresByDeck || {},
      lastAttemptsByDeck: parsed.lastAttemptsByDeck || {},
      bossAwardedMatchIds: parsed.bossAwardedMatchIds || [],
      bossBadges: parsed.bossBadges || [],
      battleHistory: parsed.battleHistory || [],
      currentStreakDays: parsed.currentStreakDays || 0,
      bestStreakDays: parsed.bestStreakDays || 0,
      lastBattleDate: parsed.lastBattleDate || null,
      unlockedAchievementIds: parsed.unlockedAchievementIds || [],
    };
  } catch {
    return defaultSnapshot();
  }
}

export function saveProgressSnapshot(storageKey: string, snapshot: ProgressSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

function toDateKey(input: string): string {
  return input.slice(0, 10);
}

function dayDiff(fromDateKey: string, toDateKeyValue: string): number {
  const from = new Date(`${fromDateKey}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDateKeyValue}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86400000);
}

export function addBattleToProgress(args: {
  snapshot: ProgressSnapshot;
  entry: BattleHistoryEntry;
}): ProgressSnapshot {
  const { snapshot, entry } = args;
  if (snapshot.battleHistory.some((item) => item.matchId === entry.matchId)) {
    return snapshot;
  }

  const nextHistory = [entry, ...snapshot.battleHistory]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 80);

  const currentDateKey = toDateKey(entry.createdAt);
  const previousDateKey = snapshot.lastBattleDate;

  let currentStreakDays = snapshot.currentStreakDays;

  if (!previousDateKey) {
    currentStreakDays = 1;
  } else if (previousDateKey === currentDateKey) {
    currentStreakDays = Math.max(1, snapshot.currentStreakDays);
  } else {
    const diff = dayDiff(previousDateKey, currentDateKey);
    if (diff === 1) {
      currentStreakDays = snapshot.currentStreakDays + 1;
    } else {
      currentStreakDays = 1;
    }
  }

  return {
    ...snapshot,
    battleHistory: nextHistory,
    currentStreakDays,
    bestStreakDays: Math.max(snapshot.bestStreakDays, currentStreakDays),
    lastBattleDate: currentDateKey,
  };
}

export function calculateLevel(totalXp: number): {
  level: number;
  xpInLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
} {
  const level = Math.floor(totalXp / 500) + 1;
  const xpInLevel = totalXp % 500;

  return {
    level,
    xpInLevel,
    xpToNextLevel: 500 - xpInLevel,
    progressPercent: (xpInLevel / 500) * 100,
  };
}

export function getRankInfo(totalXp: number, bestStreakDays: number): RankInfo {
  if (totalXp >= 12000 && bestStreakDays >= 21) {
    return { label: "Grandmaster", tier: 6 };
  }
  if (totalXp >= 7500 && bestStreakDays >= 14) {
    return { label: "Diamond", tier: 5 };
  }
  if (totalXp >= 4500) {
    return { label: "Platinum", tier: 4 };
  }
  if (totalXp >= 2500) {
    return { label: "Gold", tier: 3 };
  }
  if (totalXp >= 1200) {
    return { label: "Silver", tier: 2 };
  }
  if (totalXp >= 400) {
    return { label: "Bronze", tier: 1 };
  }

  return { label: "Rookie", tier: 0 };
}

export function getSeasonProgress(totalXp: number): SeasonProgress {
  const seasonNumber = Math.floor(totalXp / SEASON_XP_TARGET) + 1;
  const seasonXp = totalXp % SEASON_XP_TARGET;
  const checkpointsCleared = Math.floor((seasonXp / SEASON_XP_TARGET) * 5);

  return {
    seasonNumber,
    seasonXp,
    seasonXpTarget: SEASON_XP_TARGET,
    progressPercent: (seasonXp / SEASON_XP_TARGET) * 100,
    checkpointsCleared,
  };
}

export function getNextMilestoneXp(totalXp: number): number | null {
  const nextGlobal = GLOBAL_MILESTONES.find((value) => value > totalXp);
  if (typeof nextGlobal === "number") return nextGlobal;

  const nextSeason = Math.ceil((totalXp + 1) / SEASON_XP_TARGET) * SEASON_XP_TARGET;
  return nextSeason > totalXp ? nextSeason : null;
}

export function getGoalProgress(snapshot: ProgressSnapshot): {
  dailyBattles: number;
  dailyComplete: boolean;
  weeklyBattles: number;
  weeklyAverageAccuracy: number;
  weeklyComplete: boolean;
} {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const dayStart = new Date(`${dayKey}T00:00:00.000Z`).getTime();
  const weekStart = now.getTime() - 6 * 86400000;

  const dailyBattles = snapshot.battleHistory.filter(
    (item) => new Date(item.createdAt).getTime() >= dayStart
  ).length;

  const weeklyEntries = snapshot.battleHistory.filter(
    (item) => new Date(item.createdAt).getTime() >= weekStart
  );

  const weeklyBattles = weeklyEntries.length;
  const weeklyAverageAccuracy =
    weeklyEntries.length > 0
      ? Math.round(
          weeklyEntries.reduce((sum, item) => sum + item.accuracy, 0) /
            weeklyEntries.length
        )
      : 0;

  return {
    dailyBattles,
    dailyComplete: dailyBattles >= DAILY_GOAL_BATTLES,
    weeklyBattles,
    weeklyAverageAccuracy,
    weeklyComplete:
      weeklyBattles >= WEEKLY_GOAL_BATTLES &&
      weeklyAverageAccuracy >= WEEKLY_GOAL_AVG_ACCURACY,
  };
}

export type AchievementDef = {
  id: string;
  label: string;
  description: string;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_win",
    label: "First Win",
    description: "Finish your first battle with at least 60% accuracy.",
  },
  {
    id: "flawless",
    label: "Flawless",
    description: "Score 100% accuracy in a battle.",
  },
  {
    id: "speed_runner",
    label: "Speed Runner",
    description: "Finish a battle with average response under 6 seconds.",
  },
  {
    id: "streak_week",
    label: "7-Day Streak",
    description: "Battle seven days in a row.",
  },
  {
    id: "xp_2500",
    label: "Seasoned",
    description: "Reach 2,500 total XP.",
  },
];

export function evaluateAchievements(args: {
  snapshot: ProgressSnapshot;
  accuracyPercent: number;
  averageResponseTimeMs: number;
}): string[] {
  const { snapshot, accuracyPercent, averageResponseTimeMs } = args;
  const unlocked = new Set(snapshot.unlockedAchievementIds);

  if (accuracyPercent >= 60) unlocked.add("first_win");
  if (accuracyPercent === 100) unlocked.add("flawless");
  if (averageResponseTimeMs > 0 && averageResponseTimeMs < 6000) {
    unlocked.add("speed_runner");
  }
  if (snapshot.currentStreakDays >= 7) unlocked.add("streak_week");
  if (snapshot.totalXp >= 2500) unlocked.add("xp_2500");

  return Array.from(unlocked);
}
