import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type MarkReadPayload = {
  notificationIds?: string[];
  markAll?: boolean;
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MarkReadPayload = {};
  try {
    body = (await request.json()) as MarkReadPayload;
  } catch {
    body = {};
  }

  const ids = Array.isArray(body.notificationIds)
    ? body.notificationIds.filter((value) => typeof value === "string" && value.trim())
    : [];

  if (!body.markAll && ids.length === 0) {
    return NextResponse.json(
      { error: "Provide notificationIds or markAll=true." },
      { status: 400 }
    );
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

    let scopeQuery = supabase
      .from("challenge_notifications")
      .select("id")
      .or(
        displayName
          ? `target_user_id.eq.${user.id},target_player_name.ilike.${displayName}`
          : `target_user_id.eq.${user.id}`
      );

    if (!body.markAll && ids.length > 0) {
      scopeQuery = scopeQuery.in("id", ids);
    }

    const { data: scopedRows, error: scopeError } = await scopeQuery;

    if (scopeError) {
      return NextResponse.json(
        { error: "Failed to scope notifications." },
        { status: 500 }
      );
    }

    const scopedIds = (scopedRows || []).map((row: { id: string }) => row.id);

    if (scopedIds.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    const { error: updateError } = await supabase
      .from("challenge_notifications")
      .update({ is_read: true })
      .in("id", scopedIds);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to mark notifications as read." },
        { status: 500 }
      );
    }

    return NextResponse.json({ updated: scopedIds.length });
  } catch (error) {
    console.error("Notifications mark-read error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
