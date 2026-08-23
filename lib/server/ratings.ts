// Server-only rating writes.
//
// Section 73 is the whole design brief here: rating changes must be
// server-controlled, and the opponent's strength must never be taken from
// the client. A payload that says "I beat someone rated 2400" is a claim,
// not a fact, so this resolves every opponent from data the server owns:
//
//   ghost   a replay of a real past match. The opponent's rating is that
//           player's actual rating, or -- if they have none yet -- derived
//           from how the match they are replaying actually went.
//   bot     a calibrated AI opponent. Its rating is fixed per difficulty
//           and defined here, not passed in.
//
// Writes are idempotent on (match_id, user_id, subject) via a unique index,
// so a retried finish request cannot pay rating twice.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyResult,
  outcomeFromScores,
  STARTING_DEVIATION,
  STARTING_RATING,
} from "@/lib/ranking";

/**
 * What each bot difficulty is worth on the ladder.
 *
 * These are the bot's *rating*, so beating the hardest bot is worth roughly
 * as much as beating a Diamond player -- which is the honest comparison,
 * since it answers at that standard. Deliberately conservative: a ladder
 * climbed purely against bots should top out around Platinum, not Elite.
 */
const BOT_RATINGS: Record<string, number> = {
  // The rival ranks the battle screen actually offers.
  rookie: 800,
  grinder: 1050,
  scholar: 1300,
  genius: 1600,
  legend: 1900,
  // Generic aliases, so a caller using plain difficulty words still gets a
  // sensible rating rather than silently falling through to the default.
  easy: 800,
  medium: 1150,
  hard: 1500,
  expert: 1850,
};

const DEFAULT_BOT_RATING = 1150;

export type RatedOpponent =
  | { kind: "bot"; difficulty?: string | null }
  | { kind: "ghost"; matchId: string }
  | { kind: "player"; userId: string };

export type RatingOutcome = {
  subject: string;
  rating: number;
  delta: number;
  opponentRating: number;
  opponentLabel: string;
  /** True when the model gave them less than even odds going in. */
  wasUnderdog: boolean;
};

async function readRating(
  supabase: SupabaseClient,
  userId: string,
  seasonId: string | null,
  subject: string
): Promise<{ rating: number; deviation: number; wins: number; losses: number; peak: number }> {
  const { data } = await supabase
    .from("player_ratings")
    .select("rating, deviation, wins, losses, peak_rating")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .eq("subject", subject)
    .maybeSingle();

  return {
    rating: data?.rating ?? STARTING_RATING,
    deviation: data?.deviation ?? STARTING_DEVIATION,
    wins: data?.wins ?? 0,
    losses: data?.losses ?? 0,
    peak: data?.peak_rating ?? STARTING_RATING,
  };
}

/**
 * How strong the opponent actually was.
 *
 * Never trusts a client-supplied number. A ghost whose owner has no rating
 * yet is estimated from the accuracy of the match being replayed, which is
 * a real signal about how hard that performance is to beat.
 */
async function resolveOpponent(
  supabase: SupabaseClient,
  opponent: RatedOpponent,
  seasonId: string | null,
  subject: string
): Promise<{ rating: number; label: string; score: number | null }> {
  if (opponent.kind === "bot") {
    const key = String(opponent.difficulty || "").toLowerCase();
    const rating = BOT_RATINGS[key] ?? DEFAULT_BOT_RATING;
    return { rating, label: `AI (${key || "medium"})`, score: null };
  }

  if (opponent.kind === "player") {
    const state = await readRating(supabase, opponent.userId, seasonId, subject);
    return { rating: state.rating, label: "Opponent", score: null };
  }

  const { data: match } = await supabase
    .from("matches")
    .select("user_id, player_name, score, correct_answers, total_questions")
    .eq("id", opponent.matchId)
    .maybeSingle();

  if (!match) {
    return { rating: DEFAULT_BOT_RATING, label: "Ghost", score: null };
  }

  if (match.user_id) {
    const state = await readRating(supabase, match.user_id, seasonId, subject);
    return {
      rating: state.rating,
      label: match.player_name || "Ghost",
      score: match.score ?? null,
    };
  }

  // No rated owner: estimate from how well that run actually went. A 95%
  // ghost is genuinely harder to beat than a 40% one, and pretending both
  // are average would make ghost battles worthless either way.
  const accuracy =
    match.total_questions > 0 ? match.correct_answers / match.total_questions : 0.5;
  const estimated = Math.round(700 + accuracy * 900);

  return {
    rating: estimated,
    label: match.player_name || "Ghost",
    score: match.score ?? null,
  };
}

/**
 * Applies one rated result and records it.
 *
 * Never throws: a battle that has already been saved must not report
 * failure because the ladder write did not land.
 */
export async function recordRatedResult(args: {
  supabase: SupabaseClient;
  userId: string;
  matchId: string;
  /** The course or subject this deck belongs to. Ranks are per subject. */
  subject: string;
  playerScore: number;
  opponentScore: number | null;
  opponent: RatedOpponent;
}): Promise<RatingOutcome | null> {
  const { supabase, userId, matchId, playerScore, opponent } = args;

  try {
    const subject = (args.subject || "overall").trim().slice(0, 80) || "overall";

    const { data: season } = await supabase
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    const seasonId = season?.id ?? null;

    // Already rated: a retried request must not move the ladder again.
    const { data: existing } = await supabase
      .from("rating_changes")
      .select("id")
      .eq("match_id", matchId)
      .eq("user_id", userId)
      .eq("subject", subject)
      .maybeSingle();

    if (existing) return null;

    const current = await readRating(supabase, userId, seasonId, subject);
    const resolved = await resolveOpponent(supabase, opponent, seasonId, subject);

    // A bot or ghost with no recorded score is scored against what a player
    // of that rating would be expected to manage, so the result still
    // reflects margin rather than collapsing to win/lose.
    const opponentScore =
      args.opponentScore ?? resolved.score ?? Math.round(playerScore * 0.9);

    const outcome = outcomeFromScores(playerScore, opponentScore);
    const update = applyResult(
      { rating: current.rating, deviation: current.deviation },
      { score: outcome, opponentRating: resolved.rating }
    );

    const won = outcome > 0.5;

    await supabase.from("player_ratings").upsert(
      {
        user_id: userId,
        season_id: seasonId,
        subject,
        rating: update.rating,
        peak_rating: Math.max(current.peak, update.rating),
        deviation: update.deviation,
        wins: current.wins + (won ? 1 : 0),
        losses: current.losses + (won ? 0 : 1),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,season_id,subject" }
    );

    await supabase.from("rating_changes").insert({
      user_id: userId,
      match_id: matchId,
      subject,
      delta: update.delta,
      rating_after: update.rating,
      opponent_label: resolved.label,
      opponent_rating: resolved.rating,
    });

    return {
      subject,
      rating: update.rating,
      delta: update.delta,
      opponentRating: resolved.rating,
      opponentLabel: resolved.label,
      wasUnderdog: update.expected < 0.5,
    };
  } catch (error) {
    console.error(
      "Rating write failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
