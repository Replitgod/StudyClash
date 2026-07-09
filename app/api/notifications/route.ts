import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type NotificationRow = {
  id: string;
  event_type: string;
  title: string;
  message: string;
  action_href: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

function toLimit(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 50);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profileResult = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const displayName =
      typeof profileResult.data?.display_name === "string"
        ? profileResult.data.display_name.trim()
        : "";

    const limit = toLimit(request.nextUrl.searchParams.get("limit"));

    let query = supabase
      .from("challenge_notifications")
      .select(
        "id, event_type, title, message, action_href, metadata, is_read, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (displayName) {
      query = query.or(
        `target_user_id.eq.${user.id},target_player_name.ilike.${displayName}`
      );
    } else {
      query = query.eq("target_user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch notifications." },
        { status: 500 }
      );
    }

    const rows = (data || []) as NotificationRow[];
    const unreadCount = rows.filter((row) => !row.is_read).length;

    return NextResponse.json({
      notifications: rows,
      unreadCount,
    });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
