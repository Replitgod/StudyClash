import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

// Deleting a piece of material.
//
// Like every other write in AcedIQ, this cannot go through the browser
// client: `decks` has RLS enabled with a select-only policy and no
// insert/update/delete policy (see
// supabase/migrations/20260711_core_tables_rls_hardening.sql). A client-side
// delete against it does not fail loudly -- it matches zero rows and returns
// success, so the UI would report "deleted" and the material would still be
// there on the next load.
//
// Ownership is enforced by the `.eq("user_id", userId)` filter, since the
// service client bypasses RLS entirely.

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deckId = req.nextUrl.searchParams.get("id");
  if (!deckId) {
    return NextResponse.json({ error: "A material id is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: deck, error: lookupError } = await supabase
    .from("decks")
    .select("id")
    .eq("id", deckId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: "Could not delete this. Please try again." }, { status: 500 });
  }

  if (!deck) {
    // Either it never existed or it belongs to someone else. Both are "not
    // found" from this caller's point of view -- saying which would leak
    // whether a given id exists.
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  // Questions are removed explicitly rather than relying on a cascade,
  // because whether questions.deck_id was created with `on delete cascade`
  // is not recorded in any migration in this repo -- the table predates
  // them. Deleting them first is correct either way.
  await supabase.from("questions").delete().eq("deck_id", deckId);

  const { error: deleteError } = await supabase
    .from("decks")
    .delete()
    .eq("id", deckId)
    .eq("user_id", userId);

  if (deleteError) {
    return NextResponse.json({ error: "Could not delete this. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
