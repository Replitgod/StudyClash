import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

type MarkReadPayload = {
  notificationIds?: string[];
  markAll?: boolean;
};

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const supabase = getServiceSupabaseClient();

    let scopeQuery = supabase
      .from("challenge_notifications")
      .select("id")
      .eq("target_user_id", auth.userId);

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
