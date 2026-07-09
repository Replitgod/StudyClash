import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type JoinPayload = {
  roomCode?: string;
};

type RoomRecord = {
  id: string;
  room_code: string;
  title: string;
  deck_id: string | null;
  is_live: boolean;
};

export async function POST(request: NextRequest) {
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("classroom_rooms")
      .select("id, room_code, title, deck_id, is_live")
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

    return NextResponse.json({
      room: {
        id: room.id,
        roomCode: room.room_code,
        title: room.title,
      },
      deck: {
        id: deck.id,
        title: deck.title,
        courseName: deck.course_name,
      },
      battleHref: `/battle/${deck.id}?classroomCode=${room.room_code}`,
    });
  } catch (error) {
    console.error("Classroom join error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
