import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { buildShareSlug } from "@/lib/shareSlug";
import { getSiteUrl } from "@/lib/server/stripe";

// Publishing and unpublishing a study set.
//
// Like every other write against `decks`, this cannot go through the browser
// client: the table has a select-only RLS policy and no update policy, so a
// client-side update matches zero rows and reports success -- the UI would
// say "shared" and nothing would be shared. Ownership is enforced by the
// `.eq("user_id", userId)` filter, since the service client bypasses RLS.
//
// The slug is minted once, on first publish, and never reissued. Unpublish
// clears `is_public` but keeps `share_slug`, so a link a student already
// sent to their group chat resolves again the moment they republish rather
// than silently becoming a different URL.

export const runtime = "nodejs";

/** Distinct slugs are ~729M, so a collision is rare; retry rather than fail. */
const MAX_SLUG_ATTEMPTS = 5;

function shareUrlFor(slug: string): string {
  return `${getSiteUrl()}/d/${slug}`;
}

async function loadOwnedDeck(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  deckId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("decks")
    .select("id, title, is_public, share_slug")
    .eq("id", deckId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { deck: null, failed: true as const };
  return { deck: data, failed: false as const };
}

export async function POST(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const deckId = typeof body?.deckId === "string" ? body.deckId.trim() : "";
  if (!deckId) {
    return NextResponse.json({ error: "A deck id is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();
  const { deck, failed } = await loadOwnedDeck(supabase, deckId, userId);

  if (failed) {
    return NextResponse.json({ error: "Could not share this. Please try again." }, { status: 500 });
  }
  if (!deck) {
    // Either it never existed or it belongs to someone else. Saying which
    // would leak whether a given deck id exists.
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  // Already has an address: republishing reuses it, so old links keep working.
  if (deck.share_slug) {
    const { error } = await supabase
      .from("decks")
      .update({ is_public: true, shared_at: new Date().toISOString() })
      .eq("id", deckId)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Could not share this. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ slug: deck.share_slug, url: shareUrlFor(deck.share_slug) });
  }

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = buildShareSlug(deck.title || "", (max) => randomInt(max));

    const { error } = await supabase
      .from("decks")
      .update({ is_public: true, share_slug: slug, shared_at: new Date().toISOString() })
      .eq("id", deckId)
      .eq("user_id", userId);

    if (!error) {
      return NextResponse.json({ slug, url: shareUrlFor(slug) });
    }

    // 23505 = unique_violation on decks_share_slug_key: this slug's random
    // half collided. Any other error is real.
    if (error.code !== "23505") {
      console.error("Deck share failed:", error.message);
      return NextResponse.json({ error: "Could not share this. Please try again." }, { status: 500 });
    }
  }

  console.error(`Deck share: could not mint a free slug for ${deckId} in ${MAX_SLUG_ATTEMPTS} attempts.`);
  return NextResponse.json({ error: "Could not share this. Please try again." }, { status: 500 });
}

export async function DELETE(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deckId = request.nextUrl.searchParams.get("id");
  if (!deckId) {
    return NextResponse.json({ error: "A deck id is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  // share_slug is deliberately left in place -- see the note at the top.
  const { error } = await supabase
    .from("decks")
    .update({ is_public: false })
    .eq("id", deckId)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Could not unshare this. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
