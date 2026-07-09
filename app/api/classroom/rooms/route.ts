import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type CreateRoomPayload = {
  title?: string;
  deckId?: string | null;
};

type RoomRow = {
  id: string;
  owner_user_id: string;
  room_code: string;
  title: string;
  deck_id: string | null;
  is_live: boolean;
  created_at: string;
  updated_at: string;
};

const PLAN_ROOM_LIMITS: Record<string, number | null> = {
  free_beta: 1,
  pro_individual: 5,
  team_pass: 25,
  exam_tunnel: 10,
};

function getRoomLimitForPlan(planId: string | null): number | null {
  if (!planId) return PLAN_ROOM_LIMITS.free_beta;
  if (Object.prototype.hasOwnProperty.call(PLAN_ROOM_LIMITS, planId)) {
    return PLAN_ROOM_LIMITS[planId];
  }
  return PLAN_ROOM_LIMITS.free_beta;
}

function randomRoomCode(length = 6): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * alphabet.length);
    value += alphabet[index];
  }
  return value;
}

async function getAuthorizedUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return { userId: null as string | null, error: "Unauthorized" };

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { userId: null as string | null, error: "Unauthorized" };
  }

  return { userId: user.id, error: null as string | null };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthorizedUser(request);
    if (!auth.userId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: rooms, error: roomError } = await supabase
      .from("classroom_rooms")
      .select("id, owner_user_id, room_code, title, deck_id, is_live, created_at, updated_at")
      .eq("owner_user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (roomError) {
      return NextResponse.json({ error: "Failed to fetch rooms." }, { status: 500 });
    }

    const roomRows = (rooms || []) as RoomRow[];
    const deckIds = roomRows.map((room) => room.deck_id).filter((id): id is string => !!id);

    let deckMap = new Map<string, { id: string; title: string }>();
    if (deckIds.length > 0) {
      const { data: decks } = await supabase
        .from("decks")
        .select("id, title")
        .in("id", deckIds);

      deckMap = new Map((decks || []).map((deck: { id: string; title: string }) => [deck.id, deck]));
    }

    const normalizedRooms = roomRows.map((room) => ({
      ...room,
      deck_title: room.deck_id ? deckMap.get(room.deck_id)?.title || null : null,
      launch_href: room.deck_id ? `/battle/${room.deck_id}` : null,
      share_code: room.room_code,
      join_href: `/classroom/join?code=${room.room_code}`,
    }));

    return NextResponse.json({ rooms: normalizedRooms });
  } catch (error) {
    console.error("Classroom rooms GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthorizedUser(request);
    if (!auth.userId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateRoomPayload;
    const title = (body.title || "Study Session Room").trim().slice(0, 80);
    const deckId = body.deckId && body.deckId.trim() ? body.deckId.trim() : null;

    if (!title) {
      return NextResponse.json({ error: "Room title is required." }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profileData } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", auth.userId)
      .maybeSingle();

    const activePlanId =
      typeof profileData?.plan === "string" ? profileData.plan : "free_beta";
    const roomLimit = getRoomLimitForPlan(activePlanId);

    if (roomLimit !== null) {
      const { count: activeRoomCount, error: activeRoomCountError } = await supabase
        .from("classroom_rooms")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", auth.userId)
        .eq("is_live", true);

      if (activeRoomCountError) {
        return NextResponse.json(
          { error: "Failed to check room limits." },
          { status: 500 }
        );
      }

      const normalizedCount = activeRoomCount || 0;
      if (normalizedCount >= roomLimit) {
        return NextResponse.json(
          {
            error:
              "You have reached your live classroom room limit for this plan.",
            code: "ROOM_LIMIT_REACHED",
            planId: activePlanId,
            roomLimit,
            currentActiveRooms: normalizedCount,
            upgradeRequired: activePlanId === "free_beta",
            upgradeHref: "/pricing",
          },
          { status: 403 }
        );
      }
    }

    if (deckId) {
      const { data: ownedDeck } = await supabase
        .from("decks")
        .select("id")
        .eq("id", deckId)
        .eq("user_id", auth.userId)
        .maybeSingle();

      if (!ownedDeck) {
        return NextResponse.json(
          { error: "You can only attach your own deck to a classroom room." },
          { status: 403 }
        );
      }
    }

    let createdRow: RoomRow | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const roomCode = randomRoomCode(6);
      const { data, error } = await supabase
        .from("classroom_rooms")
        .insert({
          owner_user_id: auth.userId,
          room_code: roomCode,
          title,
          deck_id: deckId,
          is_live: true,
        })
        .select("id, owner_user_id, room_code, title, deck_id, is_live, created_at, updated_at")
        .single();

      if (!error && data) {
        createdRow = data as RoomRow;
        break;
      }
    }

    if (!createdRow) {
      return NextResponse.json(
        { error: "Failed to create room code. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        room: {
          ...createdRow,
          share_code: createdRow.room_code,
          join_href: `/classroom/join?code=${createdRow.room_code}`,
          launch_href: createdRow.deck_id ? `/battle/${createdRow.deck_id}` : null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Classroom rooms POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
