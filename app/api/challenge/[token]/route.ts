import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/server/apiUtils";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    if (!token) {
      return NextResponse.json({ error: "Invalid challenge link." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const { data: match, error } = await supabase
      .from("matches")
      .select("id, share_token_expires_at")
      .eq("share_token", token)
      .single();

    if (error || !match) {
      return NextResponse.json({ error: "This challenge link is no longer available." }, { status: 404 });
    }

    const expiresAt = match.share_token_expires_at
      ? new Date(match.share_token_expires_at).getTime()
      : 0;

    if (expiresAt <= Date.now()) {
      return NextResponse.json({ error: "This challenge link has expired." }, { status: 410 });
    }

    return NextResponse.json({ matchId: match.id });
  } catch (error) {
    console.error("Failed to resolve challenge link:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to resolve challenge link." }, { status: 500 });
  }
}
