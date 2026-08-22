import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

// The conversation list behind Vyra's sidebar.
//
// vyra_chat_sessions / vyra_chat_messages are RLS-closed to the browser (see
// supabase/migrations/20260713_vyra_chat_tables.sql), so every read goes
// through here, where the caller is authenticated and every query is scoped
// to their own user_id. app/api/vyra-chat/route.ts is what actually writes
// the rows; this route only lists and renames them.

export const runtime = "nodejs";

const MAX_CONVERSATIONS = 50;
const MAX_TITLE_LENGTH = 120;

export async function GET(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("vyra_chat_sessions")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_CONVERSATIONS);

  if (error) {
    // The table may not be deployed in this environment yet. An empty list
    // is the honest answer, and it keeps Vyra itself usable.
    return NextResponse.json({ conversations: [] });
  }

  return NextResponse.json({
    conversations: (data || []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) || "New chat",
      updatedAt: row.updated_at as string,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown; title?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!id) {
    return NextResponse.json({ error: "A conversation id is required." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();
  const { error } = await supabase
    .from("vyra_chat_sessions")
    .update({ title: title.slice(0, MAX_TITLE_LENGTH) })
    .eq("id", id)
    // Scoping the update by user_id is what stops one account renaming
    // another's conversation by guessing an id.
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Could not rename this chat." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "A conversation id is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();
  // vyra_chat_messages cascades on session delete (see the original
  // migration), so this removes the transcript too.
  const { error } = await supabase
    .from("vyra_chat_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Could not delete this chat." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
