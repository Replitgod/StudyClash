import { NextRequest, NextResponse } from "next/server";
import {
  checkInMemoryRateLimit,
  getServiceSupabaseClient,
  getClientIpAddress,
  getBearerToken,
  hashIdentifier,
} from "@/lib/server/apiUtils";

type JoinPayload = {
  roomCode?: string;
};

type RoomRecord = {
  id: string;
  room_code: string;
  title: string;
  deck_id: string | null;
  is_live: boolean;
  mode: string;
};

export async function POST(request: NextRequest) {
  const ipHash = hashIdentifier(getClientIpAddress(request));
  const rateLimit = checkInMemoryRateLimit({
    key: `classroom-join:${ipHash}`,
    limit: 40,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many room-join attempts. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let payload: JoinPayload = {};
  try {
    payload = (await request.json()) as JoinPayload;
  } catch {
    payload = {};
  }

  const roomCode = (payload.roomCode || "").trim().toUpperCase();
  if (!roomCode) {
    return NextResponse.json({ error: "Room code is required." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabaseClient();

    const { data, error } = await supabase
      .from("classroom_rooms")
      .select("id, room_code, title, deck_id, is_live, mode")
      .eq("room_code", roomCode)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: "Room code not found. Check the code and try again." },
        { status: 404 }
      );
    }

    const room = data as RoomRecord;

    if (!room.is_live) {
      return NextResponse.json(
        { error: "This classroom room is currently paused." },
        { status: 409 }
      );
    }

    if (!room.deck_id) {
      return NextResponse.json(
        { error: "This room does not have an active deck yet." },
        { status: 409 }
      );
    }

    const { data: deck } = await supabase
      .from("decks")
      .select("id, title, course_name")
      .eq("id", room.deck_id)
      .maybeSingle();

    if (!deck) {
      return NextResponse.json(
        { error: "The deck for this room is unavailable." },
        { status: 404 }
      );
    }

    let tournamentJoined = false;

    if (room.mode === "tournament") {
      // Practice-mode join stays guest-friendly (matches by free-typed
      // player_name is fine there since nothing downstream depends on it
      // being exact). A tournament bracket has to resolve winners by
      // comparing `matches` rows across two separate steps (join, then
      // battle) -- a free-typed name typo'd differently at either step
      // would silently break resolution. Requiring login lets bracket
      // resolution match by user_id instead, which battle/finish already
      // stamps reliably.
      const token = getBearerToken(request);
      if (!token) {
        return NextResponse.json(
          { error: "Please log in to join a tournament room." },
          { status: 401 }
        );
      }

      const {
        data: { user },
      } = await supabase.auth.getUser(token);

      if (!user) {
        return NextResponse.json(
          { error: "Please log in to join a tournament room." },
          { status: 401 }
        );
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      const playerName =
        (typeof profile?.display_name === "string" && profile.display_name.trim()) ||
        user.email?.split("@")[0] ||
        "Player";

      // Once round 1 exists the bracket is locked -- late joiners can still
      // view/play the deck normally, they just won't be seeded into a slot.
      const { count: round1Count } = await supabase
        .from("classroom_tournament_matches")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id)
        .eq("round", 1);

      if (!round1Count) {
        const { error: memberError } = await supabase
          .from("classroom_tournament_members")
          .insert({ room_id: room.id, user_id: user.id, player_name: playerName });

        // A unique-violation just means they already joined -- not an error.
        tournamentJoined = !memberError;
      }
    }

    return NextResponse.json({
      room: {
        id: room.id,
        roomCode: room.room_code,
        title: room.title,
        mode: room.mode,
      },
      deck: {
        id: deck.id,
        title: deck.title,
        courseName: deck.course_name,
      },
      battleHref: `/battle/${deck.id}?classroomCode=${room.room_code}`,
      tournamentHref: room.mode === "tournament" ? `/tournament/${room.room_code}` : null,
      tournamentJoined,
    });
  } catch (error) {
    console.error("Classroom join error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
