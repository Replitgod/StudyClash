import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { ensureTodaysQuests } from "@/lib/server/progression";
import { levelProgress, questProgress, type QuestKey } from "@/lib/progression";
import { rankForRating, rankProgress, winRate } from "@/lib/ranking";

export const runtime = "nodejs";

// Everything the student's own progression surfaces need, in one read:
// level and XP, streak, today's quests, rank, and recently earned
// achievements.
//
// One route rather than five because Home renders all of it at once, and
// five round trips to paint one screen is how a dashboard ends up slower
// than the work it is describing.
//
// Every one of these tables is service-role for writes (see the migration),
// so the `.eq("user_id", userId)` scoping below is what makes this safe. It
// is not optional.

export async function GET(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();

  const url = new URL(req.url);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") || "")
    ? (url.searchParams.get("date") as string)
    : new Date().toISOString().slice(0, 10);

  const hasReviewsDue = url.searchParams.get("reviewsDue") === "1";

  try {
    const [progressResult, seasonResult, battleResult] = await Promise.all([
      supabase
        .from("player_progress")
        .select("xp, level, current_streak, longest_streak, last_active_on, streak_freezes")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("seasons")
        .select("id, name, started_at, ends_at")
        .eq("is_active", true)
        .maybeSingle(),
      // Whether they have ever battled, which decides if the battle quest
      // is offered at all -- a quest you cannot complete teaches a student
      // that quests are noise.
      supabase
        .from("matches")
        .select("id")
        .eq("user_id", userId)
        .limit(1),
    ]);

    const hasBattled = (battleResult.data || []).length > 0;

    await ensureTodaysQuests(supabase, userId, today, { hasReviewsDue, hasBattled });

    const seasonId = seasonResult.data?.id ?? null;

    const [questResult, ratingResult, achievementResult] = await Promise.all([
      supabase
        .from("daily_quests")
        .select("quest_key, progress, target, completed_at")
        .eq("user_id", userId)
        .eq("quest_date", today),
      supabase
        .from("player_ratings")
        .select("subject, rating, peak_rating, wins, losses")
        .eq("user_id", userId)
        .eq("season_id", seasonId)
        .order("rating", { ascending: false }),
      supabase
        .from("user_achievements")
        .select("achievement_key, progress, earned_at")
        .eq("user_id", userId)
        .not("earned_at", "is", null)
        .order("earned_at", { ascending: false })
        .limit(12),
    ]);

    const xp = progressResult.data?.xp ?? 0;

    const quests = (questResult.data || [])
      .map((row: { quest_key: string; progress: number | null }) =>
        questProgress(row.quest_key as QuestKey, row.progress ?? 0)
      )
      // A quest key that has since been retired should disappear rather
      // than render as an undefined row.
      .filter((quest) => Boolean(quest.title));

    const ratings = (ratingResult.data || []).map(
      (row: {
        subject: string;
        rating: number;
        peak_rating: number;
        wins: number;
        losses: number;
      }) => ({
        subject: row.subject,
        rating: row.rating,
        peakRating: row.peak_rating,
        wins: row.wins,
        losses: row.losses,
        winRate: winRate(row.wins, row.losses),
        rank: rankForRating(row.rating),
        rankPercent: rankProgress(row.rating),
      })
    );

    return NextResponse.json({
      level: levelProgress(xp),
      xp,
      streak: {
        current: progressResult.data?.current_streak ?? 0,
        longest: progressResult.data?.longest_streak ?? 0,
        lastActiveOn: progressResult.data?.last_active_on ?? null,
        freezes: progressResult.data?.streak_freezes ?? 0,
      },
      quests,
      ratings,
      season: seasonResult.data
        ? {
            id: seasonResult.data.id,
            name: seasonResult.data.name,
            startedAt: seasonResult.data.started_at,
            endsAt: seasonResult.data.ends_at,
          }
        : null,
      achievements: achievementResult.data || [],
    });
  } catch (error) {
    console.error(
      "Failed to read progress:",
      error instanceof Error ? error.message : error
    );
    // These tables may not be deployed yet. An empty progression is the
    // honest answer and keeps Home rendering.
    return NextResponse.json({
      level: levelProgress(0),
      xp: 0,
      streak: { current: 0, longest: 0, lastActiveOn: null, freezes: 0 },
      quests: [],
      ratings: [],
      season: null,
      achievements: [],
    });
  }
}
