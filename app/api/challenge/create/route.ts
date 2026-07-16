import { NextRequest, NextResponse } from "next/server";
import {
  generateOpaqueToken,
  getClientIpAddress,
  getServiceSupabaseClient,
  hashIdentifier,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(req: NextRequest) {
  try {
    const ipHash = hashIdentifier(getClientIpAddress(req));
    const rateLimit = await checkDistributedRateLimit({
      key: `challenge-create:${ipHash}`,
      limit: 20,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    const matchId = typeof body?.matchId === "string" ? body.matchId.trim() : "";

    if (!matchId) {
      return NextResponse.json({ error: "matchId is required." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    const { data: match, error: fetchError } = await supabase
      .from("matches")
      .select("id, share_token, share_token_expires_at")
      .eq("id", matchId)
      .single();

    if (fetchError || !match) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }

    const now = Date.now();
    const existingExpiresAt = match.share_token_expires_at
      ? new Date(match.share_token_expires_at).getTime()
      : 0;

    if (match.share_token && existingExpiresAt > now) {
      return NextResponse.json({
        token: match.share_token,
        expiresAt: match.share_token_expires_at,
      });
    }

    const token = generateOpaqueToken();
    const expiresAt = new Date(now + TOKEN_TTL_MS).toISOString();

    const { error: updateError } = await supabase
      .from("matches")
      .update({ share_token: token, share_token_expires_at: expiresAt })
      .eq("id", matchId);

    if (updateError) {
      return NextResponse.json(
        { error: "Could not create a share link right now. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    console.error("Failed to create share link:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to create share link. Please try again." }, { status: 500 });
  }
}
