import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

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
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = getServiceSupabaseClient();

    const profileResult = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", auth.userId)
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
        `target_user_id.eq.${auth.userId},target_player_name.ilike.${displayName}`
      );
    } else {
      query = query.eq("target_user_id", auth.userId);
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
