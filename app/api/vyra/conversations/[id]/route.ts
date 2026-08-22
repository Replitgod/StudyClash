import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

// Reads back one conversation's transcript so reopening a chat shows what
// was actually said, rather than an empty thread with an old title.

export const runtime = "nodejs";

const MAX_MESSAGES = 200;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "A conversation id is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  // Confirm ownership before reading any messages: the messages table has no
  // user_id of its own, so this is what scopes the read.
  const { data: session, error: sessionError } = await supabase
    .from("vyra_chat_sessions")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("vyra_chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);

  if (error) {
    return NextResponse.json({ error: "Could not load this chat." }, { status: 500 });
  }

  return NextResponse.json({
    id: session.id as string,
    title: (session.title as string | null) || "New chat",
    messages: (data || []).map((row) => ({
      id: row.id as string,
      role: row.role as "user" | "assistant",
      content: row.content as string,
    })),
  });
}
