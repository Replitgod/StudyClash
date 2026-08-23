// Server-only writes for XP, streaks, quests and achievements.
//
// Everything here runs with the service client and is called from API
// routes, never from the browser. A student who can POST their own XP does
// not have a progression system, they have a text field.
//
// Two properties every function below preserves:
//
//   Idempotent  A retried request must not pay twice. XP is written through
//               an append-only table with a unique (user, reason, source)
//               index, and the balance is recomputed from it, so a double
//               submit is a no-op rather than double the reward.
//
//   Derived     `player_progress.xp` and `.level` are caches of the event
//               log, recomputed on write. If they ever disagree with the
//               log, the log wins.
//
// None of this is allowed to fail a study session. A student who finished
// their questions has finished them; a failed quest write is our problem,
// not theirs, so every entry point swallows its own errors and says so.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  advanceStreak,
  levelForXp,
  questsForToday,
  QUEST_CATALOGUE,
  XP_REASONS,
  type QuestKey,
  type StreakState,
  type XpReason,
} from "@/lib/progression";

export type XpAward = {
  reason: XpReason;
  /**
   * What earned it. Two awards with the same reason and source pay once.
   * Omit only for something genuinely repeatable with no identity.
   */
  sourceId?: string;
  /** Defaults to 1. Used for per-question style awards. */
  quantity?: number;
};

export type ProgressionResult = {
  xpAwarded: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  currentStreak: number;
  streakExtended: boolean;
  usedFreeze: boolean;
  questsCompleted: QuestKey[];
  achievementsEarned: string[];
};

const EMPTY_RESULT: ProgressionResult = {
  xpAwarded: 0,
  totalXp: 0,
  level: 1,
  leveledUp: false,
  currentStreak: 0,
  streakExtended: false,
  usedFreeze: false,
  questsCompleted: [],
  achievementsEarned: [],
};

/* ------------------------------------------------------------------- xp */

async function readProgress(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  xp: number;
  level: number;
  streak: StreakState;
}> {
  const { data } = await supabase
    .from("player_progress")
    .select("xp, level, current_streak, longest_streak, last_active_on, streak_freezes")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    xp: data?.xp ?? 0,
    level: data?.level ?? 1,
    streak: {
      currentStreak: data?.current_streak ?? 0,
      longestStreak: data?.longest_streak ?? 0,
      lastActiveOn: data?.last_active_on ?? null,
      streakFreezes: data?.streak_freezes ?? 0,
    },
  };
}

/**
 * Writes the XP events, skipping any that were already paid.
 *
 * Returns what was actually newly awarded, which is what the UI should
 * animate -- showing "+30 XP" for a retry that paid nothing would be a lie
 * the student could catch by refreshing.
 */
async function insertXpEvents(
  supabase: SupabaseClient,
  userId: string,
  awards: XpAward[]
): Promise<number> {
  const rows = awards
    .filter((award) => XP_REASONS[award.reason])
    .map((award) => ({
      user_id: userId,
      reason: award.reason,
      source_id: award.sourceId ?? null,
      amount: XP_REASONS[award.reason].amount * Math.max(1, award.quantity ?? 1),
    }))
    .filter((row) => row.amount > 0);

  if (rows.length === 0) return 0;

  // ignoreDuplicates leans on the unique (user, reason, source_id) index:
  // the second attempt at the same award is silently dropped rather than
  // erroring, and `data` comes back holding only what was really inserted.
  const { data, error } = await supabase
    .from("xp_events")
    .upsert(rows, {
      onConflict: "user_id,reason,source_id",
      ignoreDuplicates: true,
    })
    .select("amount");

  if (error) throw error;

  return (data || []).reduce(
    (sum: number, row: { amount: number | null }) => sum + (row.amount || 0),
    0
  );
}

/* --------------------------------------------------------------- quests */

async function applyQuestProgress(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  deltas: Partial<Record<QuestKey, number>>
): Promise<QuestKey[]> {
  const keys = Object.keys(deltas) as QuestKey[];
  if (keys.length === 0) return [];

  const { data: existing } = await supabase
    .from("daily_quests")
    .select("id, quest_key, progress, target, completed_at")
    .eq("user_id", userId)
    .eq("quest_date", today);

  const byKey = new Map(
    (existing || []).map((row: { quest_key: string }) => [row.quest_key, row])
  );

  const completed: QuestKey[] = [];

  for (const key of keys) {
    const delta = deltas[key] ?? 0;
    if (delta <= 0) continue;

    const definition = QUEST_CATALOGUE[key];
    if (!definition) continue;

    const row = byKey.get(key) as
      | { id: string; progress: number; target: number; completed_at: string | null }
      | undefined;

    // A quest that is already done stays done. Re-completing it must not
    // pay again, which is why the completed_at check comes before the write.
    if (row?.completed_at) continue;

    const progress = Math.min(definition.target, (row?.progress ?? 0) + delta);
    const isComplete = progress >= definition.target;

    if (row) {
      await supabase
        .from("daily_quests")
        .update({
          progress,
          completed_at: isComplete ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
    } else {
      await supabase.from("daily_quests").insert({
        user_id: userId,
        quest_date: today,
        quest_key: key,
        target: definition.target,
        progress,
        completed_at: isComplete ? new Date().toISOString() : null,
      });
    }

    if (isComplete) completed.push(key);
  }

  return completed;
}

/* --------------------------------------------------------- achievements */

/**
 * Advances achievement counters and returns any newly earned.
 *
 * Progress is stored per achievement so a counter like "recover 10
 * concepts" survives across sessions. `earned_at` is written once and never
 * cleared -- an achievement is a record of something that happened.
 */
async function applyAchievements(
  supabase: SupabaseClient,
  userId: string,
  deltas: Record<string, number>
): Promise<string[]> {
  const keys = Object.keys(deltas).filter((key) => (deltas[key] ?? 0) > 0);
  if (keys.length === 0) return [];

  const { data: catalogue } = await supabase
    .from("achievements")
    .select("key, target")
    .in("key", keys);

  if (!catalogue || catalogue.length === 0) return [];

  const { data: existing } = await supabase
    .from("user_achievements")
    .select("achievement_key, progress, earned_at")
    .eq("user_id", userId)
    .in("achievement_key", keys);

  const byKey = new Map(
    (existing || []).map((row: { achievement_key: string }) => [row.achievement_key, row])
  );

  const earned: string[] = [];

  for (const entry of catalogue as Array<{ key: string; target: number }>) {
    const row = byKey.get(entry.key) as
      | { progress: number; earned_at: string | null }
      | undefined;

    if (row?.earned_at) continue;

    const progress = (row?.progress ?? 0) + (deltas[entry.key] ?? 0);
    const isEarned = progress >= entry.target;

    await supabase.from("user_achievements").upsert(
      {
        user_id: userId,
        achievement_key: entry.key,
        progress: Math.min(progress, entry.target),
        earned_at: isEarned ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,achievement_key" }
    );

    if (isEarned) earned.push(entry.key);
  }

  return earned;
}

/* ----------------------------------------------------------- entry point */

export type SessionProgressInput = {
  userId: string;
  /** The match this session produced. Used to make every award idempotent. */
  matchId: string;
  questionsAnswered: number;
  correctAnswers: number;
  mistakesRecovered: number;
  /** Topics that moved up a mastery tier because of this session. */
  topicsImproved: number;
  /** True when this session cleared reviews that were due. */
  clearedReviews: boolean;
  isBattleWin: boolean;
  /** The student's local date, so streaks follow their day, not the server's. */
  today: string;
};

/**
 * Everything a finished session is worth, in one call.
 *
 * Never throws. A study session that saved correctly must not report
 * failure because a quest row would not write.
 */
export async function recordSessionProgress(
  supabase: SupabaseClient,
  input: SessionProgressInput
): Promise<ProgressionResult> {
  try {
    const before = await readProgress(supabase, input.userId);

    /* --- XP ------------------------------------------------------------ */
    const awards: XpAward[] = [
      {
        reason: "question_answered",
        sourceId: input.matchId,
        quantity: Math.max(0, input.questionsAnswered),
      },
      { reason: "session_completed", sourceId: input.matchId },
    ];

    if (input.mistakesRecovered > 0) {
      awards.push({
        reason: "mistake_recovered",
        sourceId: input.matchId,
        quantity: input.mistakesRecovered,
      });
    }
    if (input.topicsImproved > 0) {
      awards.push({
        reason: "topic_improved",
        sourceId: input.matchId,
        quantity: input.topicsImproved,
      });
    }
    if (input.clearedReviews) {
      awards.push({ reason: "review_completed", sourceId: input.matchId });
    }
    if (input.questionsAnswered > 0 && input.correctAnswers === input.questionsAnswered) {
      awards.push({ reason: "perfect_session", sourceId: input.matchId });
    }
    if (input.isBattleWin) {
      awards.push({ reason: "battle_won", sourceId: input.matchId });
    }

    const xpAwarded = await insertXpEvents(supabase, input.userId, awards);

    /* --- Streak -------------------------------------------------------- */
    const streak = advanceStreak(before.streak, input.today);

    // The streak-day bonus is keyed on the date, so studying five times in
    // one day pays it once.
    let streakXp = 0;
    if (streak.extended) {
      streakXp = await insertXpEvents(supabase, input.userId, [
        { reason: "streak_day", sourceId: input.today },
      ]);
    }

    const totalXp = before.xp + xpAwarded + streakXp;
    const level = levelForXp(totalXp);

    await supabase.from("player_progress").upsert(
      {
        user_id: input.userId,
        xp: totalXp,
        level,
        current_streak: streak.currentStreak,
        longest_streak: streak.longestStreak,
        last_active_on: streak.lastActiveOn,
        streak_freezes: streak.streakFreezes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    /* --- Quests -------------------------------------------------------- */
    const questsCompleted = await applyQuestProgress(
      supabase,
      input.userId,
      input.today,
      {
        daily_training: input.questionsAnswered,
        comeback: input.mistakesRecovered,
        consistency: input.clearedReviews ? 1 : 0,
        competitor: input.isBattleWin ? 1 : 0,
      }
    );

    let questXp = 0;
    if (questsCompleted.length > 0) {
      questXp = await insertXpEvents(
        supabase,
        input.userId,
        questsCompleted.map((key) => ({
          reason: "quest_completed" as XpReason,
          sourceId: `${input.today}:${key}`,
        }))
      );

      if (questXp > 0) {
        await supabase
          .from("player_progress")
          .update({ xp: totalXp + questXp, level: levelForXp(totalXp + questXp) })
          .eq("user_id", input.userId);
      }
    }

    /* --- Achievements -------------------------------------------------- */
    const achievementsEarned = await applyAchievements(supabase, input.userId, {
      comeback_kid: input.mistakesRecovered,
      first_recovery: input.mistakesRecovered,
      deep_work: input.questionsAnswered,
      weakness_crusher: input.topicsImproved,
      perfect_round:
        input.questionsAnswered >= 5 && input.correctAnswers === input.questionsAnswered
          ? 1
          : 0,
      locked_in: streak.extended ? 1 : 0,
      month_of_focus: streak.extended ? 1 : 0,
    });

    const finalXp = totalXp + questXp;

    return {
      xpAwarded: xpAwarded + streakXp + questXp,
      totalXp: finalXp,
      level: levelForXp(finalXp),
      leveledUp: levelForXp(finalXp) > before.level,
      currentStreak: streak.currentStreak,
      streakExtended: streak.extended,
      usedFreeze: streak.usedFreeze,
      questsCompleted,
      achievementsEarned,
    };
  } catch (error) {
    console.error(
      "Progression write failed:",
      error instanceof Error ? error.message : error
    );
    return EMPTY_RESULT;
  }
}

/** Which quests to show today, creating today's rows if they do not exist. */
export async function ensureTodaysQuests(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  context: { hasReviewsDue: boolean; hasBattled: boolean }
): Promise<void> {
  try {
    const keys = questsForToday(context);
    const rows = keys.map((key) => ({
      user_id: userId,
      quest_date: today,
      quest_key: key,
      target: QUEST_CATALOGUE[key].target,
      progress: 0,
    }));

    // Existing rows keep their progress: this only fills in the gaps.
    await supabase
      .from("daily_quests")
      .upsert(rows, {
        onConflict: "user_id,quest_date,quest_key",
        ignoreDuplicates: true,
      });
  } catch {
    // Quests are a nicety. Failing to create them must not break the page
    // that asked for them.
  }
}
