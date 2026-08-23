import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

export const runtime = "nodejs";

// The recorded sub-skills behind a student's mistakes, across every deck.
//
// Ranking weak topics happens on the client, from the mastery state already
// in the study snapshot -- recomputing it here would be a second
// implementation of the same rules, and the two would eventually disagree.
// This supplies the one thing the client does not have: what specifically
// went wrong, from `mistake_breakdowns`.
//
// Scoped by user_id against the service client. Not optional.

const MAX_ROWS = 400;

export async function GET(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("mistake_breakdowns")
      .select("deck_id, topic, misunderstood_concept, confidence_rating")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);

    if (error) throw error;

    return NextResponse.json({
      mistakes: (data || []).map(
        (row: {
          deck_id: string;
          topic: string | null;
          misunderstood_concept: string | null;
          confidence_rating: string | null;
        }) => ({
          deckId: row.deck_id,
          topic: row.topic || "",
          concept: row.misunderstood_concept || "",
          confidence: row.confidence_rating,
        })
      ),
    });
  } catch {
    // The table may not be deployed, or this account may pre-date the
    // user_id column. "No recorded patterns" is the honest answer -- the
    // weakness card still works, it just cannot list sub-skills.
    return NextResponse.json({ mistakes: [] });
  }
}
