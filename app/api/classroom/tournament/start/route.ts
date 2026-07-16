import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { pairPlayersForRound, shufflePlayers, type BracketPlayer } from "@/lib/server/tournamentBracket";

const MIN_TOURNAMENT_PLAYERS = 2;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.userId) {
      return NextResponse.json({ error: auth.errorResponse || "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : "";

    if (!roomCode) {
      return NextResponse.json({ error: "Room code is required." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    const { data: room, error: roomError } = await supabase
      .from("classroom_rooms")
      .select("id, owner_user_id, room_code, mode")
      .eq("room_code", roomCode)
      .maybeSingle();

    if (roomError || !room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    if (room.owner_user_id !== auth.userId) {
      return NextResponse.json(
        { error: "Only the room owner can start this tournament." },
        { status: 403 }
      );
    }

    if (room.mode !== "tournament") {
      return NextResponse.json(
        { error: "This room is not a tournament room." },
        { status: 400 }
      );
    }

    const { count: existingRound1Count } = await supabase
      .from("classroom_tournament_matches")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("round", 1);

    if (existingRound1Count && existingRound1Count > 0) {
      return NextResponse.json(
        { error: "This tournament has already started.", alreadyStarted: true },
        { status: 409 }
      );
    }

    const { data: members, error: membersError } = await supabase
      .from("classroom_tournament_members")
      .select("user_id, player_name")
      .eq("room_id", room.id);

    if (membersError) {
      return NextResponse.json({ error: "Failed to load registered players." }, { status: 500 });
    }

    const players: BracketPlayer[] = (members || []).map((m: { user_id: string; player_name: string }) => ({
      userId: m.user_id,
      name: m.player_name,
    }));

    if (players.length < MIN_TOURNAMENT_PLAYERS) {
      return NextResponse.json(
        { error: `At least ${MIN_TOURNAMENT_PLAYERS} registered players are needed to start.` },
        { status: 400 }
      );
    }

    const shuffled = shufflePlayers(players);
    const pairings = pairPlayersForRound(shuffled);

    const rows = pairings.map((pairing) => ({
      room_id: room.id,
      round: 1,
      slot: pairing.slot,
      player_a_user_id: pairing.playerA.userId,
      player_a_name: pairing.playerA.name,
      player_b_user_id: pairing.playerB?.userId || null,
      player_b_name: pairing.playerB?.name || null,
      status: pairing.playerB ? "pending" : "bye",
      winner_user_id: pairing.playerB ? null : pairing.playerA.userId,
      winner_name: pairing.playerB ? null : pairing.playerA.name,
    }));

    const { error: insertError } = await supabase.from("classroom_tournament_matches").insert(rows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ started: true, round1MatchCount: rows.length });
  } catch (error) {
    console.error("Failed to start tournament:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to start tournament." }, { status: 500 });
  }
}
