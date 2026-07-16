import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { pairPlayersForRound, type BracketPlayer } from "@/lib/server/tournamentBracket";

type MatchRow = {
  id: string;
  room_id: string;
  round: number;
  slot: number;
  player_a_user_id: string | null;
  player_a_name: string | null;
  player_b_user_id: string | null;
  player_b_name: string | null;
  player_a_score: number | null;
  player_b_score: number | null;
  winner_user_id: string | null;
  winner_name: string | null;
  status: "pending" | "complete" | "bye";
  created_at: string;
};

// Best (highest score, then fastest) submission a player made against this
// deck after a given bracket pairing was created -- mirrors the tiebreak
// battle/finish already uses for the per-deck leaderboard.
async function findBestPostPairingResult(args: {
  supabase: ReturnType<typeof getServiceSupabaseClient>;
  deckId: string;
  userId: string;
  sinceIso: string;
}): Promise<{ score: number; timeTakenSeconds: number } | null> {
  const { supabase, deckId, userId, sinceIso } = args;

  const { data } = await supabase
    .from("matches")
    .select("score, time_taken_seconds")
    .eq("deck_id", deckId)
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .order("score", { ascending: false })
    .order("time_taken_seconds", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { score: data.score, timeTakenSeconds: data.time_taken_seconds };
}

// Without this, a bracket slot where one paired player simply never plays
// stays "pending" forever, permanently blocking the round (and everyone
// else's progress) since resolveRoundInPlace only used to advance once BOTH
// players had posted a result. Tournaments here are async/self-paced
// (classroom_tournaments.sql: "no live/real-time layer"), so a generous
// window is used -- long enough that a same-day classroom session never
// trips it, short enough that a multi-day room doesn't stall indefinitely.
const FORFEIT_TIMEOUT_MS = 48 * 60 * 60 * 1000;

async function resolveRoundInPlace(args: {
  supabase: ReturnType<typeof getServiceSupabaseClient>;
  deckId: string;
  roundMatches: MatchRow[];
}): Promise<MatchRow[]> {
  const { supabase, deckId, roundMatches } = args;

  const resolved = await Promise.all(
    roundMatches.map(async (match) => {
      if (match.status !== "pending" || !match.player_a_user_id || !match.player_b_user_id) {
        return match;
      }

      const [resultA, resultB] = await Promise.all([
        findBestPostPairingResult({
          supabase,
          deckId,
          userId: match.player_a_user_id,
          sinceIso: match.created_at,
        }),
        findBestPostPairingResult({
          supabase,
          deckId,
          userId: match.player_b_user_id,
          sinceIso: match.created_at,
        }),
      ]);

      const pairedAtMs = new Date(match.created_at).getTime();
      const timedOut = Date.now() - pairedAtMs >= FORFEIT_TIMEOUT_MS;

      if (!resultA && !resultB) {
        // Neither player has played this pairing yet. Nothing to resolve
        // unless the forfeit window has elapsed, in which case the bracket
        // needs *a* winner to keep the round moving -- player A advances,
        // the same arbitrary-but-deterministic tiebreak convention already
        // used below for a genuine score tie.
        if (!timedOut) return match;

        const updated = {
          ...match,
          winner_user_id: match.player_a_user_id,
          winner_name: match.player_a_name,
          status: "complete" as const,
        };

        await supabase
          .from("classroom_tournament_matches")
          .update({
            winner_user_id: updated.winner_user_id,
            winner_name: updated.winner_name,
            status: updated.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id);

        return updated;
      }

      if (!resultA || !resultB) {
        // Exactly one player has played. Resolve immediately by forfeit
        // once the window elapses; otherwise keep waiting for the other
        // player -- they may still be about to submit.
        if (!timedOut) return match;

        const winnerIsA = Boolean(resultA);
        const updated = {
          ...match,
          player_a_score: resultA?.score ?? null,
          player_b_score: resultB?.score ?? null,
          winner_user_id: winnerIsA ? match.player_a_user_id : match.player_b_user_id,
          winner_name: winnerIsA ? match.player_a_name : match.player_b_name,
          status: "complete" as const,
        };

        await supabase
          .from("classroom_tournament_matches")
          .update({
            player_a_score: updated.player_a_score,
            player_b_score: updated.player_b_score,
            winner_user_id: updated.winner_user_id,
            winner_name: updated.winner_name,
            status: updated.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id);

        return updated;
      }

      // Same tiebreak as didBeatMatch() in battle/finish: higher score wins,
      // ties broken by faster time. A genuine exact tie on both keeps A in
      // the slot (arbitrary but deterministic).
      const aWins =
        resultA.score !== resultB.score
          ? resultA.score > resultB.score
          : resultA.timeTakenSeconds <= resultB.timeTakenSeconds;

      const winnerUserId = aWins ? match.player_a_user_id : match.player_b_user_id;
      const winnerName = aWins ? match.player_a_name : match.player_b_name;

      const updated = {
        ...match,
        player_a_score: resultA.score,
        player_b_score: resultB.score,
        winner_user_id: winnerUserId,
        winner_name: winnerName,
        status: "complete" as const,
      };

      await supabase
        .from("classroom_tournament_matches")
        .update({
          player_a_score: updated.player_a_score,
          player_b_score: updated.player_b_score,
          winner_user_id: updated.winner_user_id,
          winner_name: updated.winner_name,
          status: updated.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", match.id);

      return updated;
    })
  );

  return resolved;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode: rawRoomCode } = await params;
    const roomCode = rawRoomCode.trim().toUpperCase();

    if (!roomCode) {
      return NextResponse.json({ error: "Room code is required." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    const { data: room, error: roomError } = await supabase
      .from("classroom_rooms")
      .select("id, room_code, title, deck_id, mode, owner_user_id")
      .eq("room_code", roomCode)
      .maybeSingle();

    if (roomError || !room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    if (room.mode !== "tournament") {
      return NextResponse.json({ error: "This room is not a tournament room." }, { status: 400 });
    }

    if (!room.deck_id) {
      return NextResponse.json({ error: "This room has no deck attached." }, { status: 409 });
    }

    const { data: memberRows } = await supabase
      .from("classroom_tournament_members")
      .select("user_id, player_name, joined_at")
      .eq("room_id", room.id)
      .order("joined_at", { ascending: true });

    const { data: deck } = await supabase
      .from("decks")
      .select("id, title, course_name")
      .eq("id", room.deck_id)
      .maybeSingle();

    const { data: allMatches } = await supabase
      .from("classroom_tournament_matches")
      .select(
        "id, room_id, round, slot, player_a_user_id, player_a_name, player_b_user_id, player_b_name, player_a_score, player_b_score, winner_user_id, winner_name, status, created_at"
      )
      .eq("room_id", room.id)
      .order("round", { ascending: true })
      .order("slot", { ascending: true });

    let matches = (allMatches || []) as MatchRow[];

    if (matches.length > 0) {
      const maxRound = Math.max(...matches.map((m) => m.round));
      const currentRoundMatches = matches.filter((m) => m.round === maxRound);

      const resolvedCurrentRound = await resolveRoundInPlace({
        supabase,
        deckId: room.deck_id,
        roundMatches: currentRoundMatches,
      });

      matches = matches.map(
        (m) => resolvedCurrentRound.find((r) => r.id === m.id) || m
      );

      const allDecided = resolvedCurrentRound.every((m) => m.status !== "pending");

      if (allDecided && resolvedCurrentRound.length > 1) {
        const winners: BracketPlayer[] = resolvedCurrentRound
          .sort((a, b) => a.slot - b.slot)
          .map((m) => ({ userId: m.winner_user_id as string, name: m.winner_name as string }));

        const nextPairings = pairPlayersForRound(winners);
        const nextRows = nextPairings.map((pairing) => ({
          room_id: room.id,
          round: maxRound + 1,
          slot: pairing.slot,
          player_a_user_id: pairing.playerA.userId,
          player_a_name: pairing.playerA.name,
          player_b_user_id: pairing.playerB?.userId || null,
          player_b_name: pairing.playerB?.name || null,
          status: pairing.playerB ? "pending" : "bye",
          winner_user_id: pairing.playerB ? null : pairing.playerA.userId,
          winner_name: pairing.playerB ? null : pairing.playerA.name,
        }));

        // Ignore unique-violation if two concurrent requests both tried to
        // generate the same next round -- whichever inserted first wins,
        // the loser's insert just no-ops.
        const { error: insertError, data: insertedRows } = await supabase
          .from("classroom_tournament_matches")
          .insert(nextRows)
          .select(
            "id, room_id, round, slot, player_a_user_id, player_a_name, player_b_user_id, player_b_name, player_a_score, player_b_score, winner_user_id, winner_name, status, created_at"
          );

        if (!insertError && insertedRows) {
          matches = [...matches, ...(insertedRows as MatchRow[])];
        }
      }
    }

    const finalRound = matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0;
    const finalRoundMatches = matches.filter((m) => m.round === finalRound);
    const champion =
      finalRoundMatches.length === 1 && finalRoundMatches[0].status !== "pending"
        ? { userId: finalRoundMatches[0].winner_user_id, name: finalRoundMatches[0].winner_name }
        : null;

    return NextResponse.json({
      room: {
        id: room.id,
        roomCode: room.room_code,
        title: room.title,
        ownerUserId: room.owner_user_id,
      },
      deck: deck ? { id: deck.id, title: deck.title, courseName: deck.course_name } : null,
      members: (memberRows || []).map((m: { user_id: string; player_name: string; joined_at: string }) => ({
        userId: m.user_id,
        name: m.player_name,
        joinedAt: m.joined_at,
      })),
      started: matches.length > 0,
      matches: matches.map((m) => ({
        id: m.id,
        round: m.round,
        slot: m.slot,
        playerA: m.player_a_user_id ? { userId: m.player_a_user_id, name: m.player_a_name } : null,
        playerB: m.player_b_user_id ? { userId: m.player_b_user_id, name: m.player_b_name } : null,
        playerAScore: m.player_a_score,
        playerBScore: m.player_b_score,
        winner: m.winner_user_id ? { userId: m.winner_user_id, name: m.winner_name } : null,
        status: m.status,
      })),
      champion,
    });
  } catch (error) {
    console.error("Failed to load tournament:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to load tournament." }, { status: 500 });
  }
}
