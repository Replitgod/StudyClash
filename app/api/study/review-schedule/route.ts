import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

// The student's per-topic review schedule.
//
// This has to be a server route rather than a direct browser query:
// `topic_review_schedule` has RLS enabled with no anon/authenticated
// policies at all (see supabase/migrations/20260712_srs_review_schedule.sql
// -- it is written by /api/battle/finish and read by the cron job, both
// service-role). A client-side `.from("topic_review_schedule").select()`
// against it does not error, it just returns zero rows, which would have
// made every "due for review" and weak-topic feature on Home and Practice
// silently show nothing at all.
//
// The service client can read every row, so the `.eq("user_id", userId)`
// below is what does the scoping. It is not optional.

export const runtime = "nodejs";

// Comfortably more topics than any real student accumulates, and bounded so
// this can never become an unbounded read.
const MAX_ROWS = 500;

export async function GET(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("topic_review_schedule")
    // `attempts` and `last_practiced_at` are what let the mastery engine
    // model forgetting (lib/mastery.ts). Without them every topic looks
    // equally fresh and nothing can ever be reported as fading.
    .select(
      "deck_id, topic, status, correct_count, total_count, next_review_at, attempts, last_practiced_at, recoveries"
    )
    .eq("user_id", userId)
    .limit(MAX_ROWS);

  if (error) {
    // The table may not exist in this environment. "Nothing is due" is the
    // honest answer and keeps every screen that reads this usable.
    return NextResponse.json({ topics: [] });
  }

  // A session screen additionally asks for per-question history on the one
  // deck it is about to run, so lib/adaptiveSession.ts can lead with the
  // questions this student actually keeps missing rather than whichever
  // rows the database returned first. Scoped to a single deck so this stays
  // a bounded read, and same RLS reasoning as the topic table above.
  const deckId = req.nextUrl.searchParams.get("deckId");
  if (!deckId) {
    return NextResponse.json({ topics: data || [], questions: [] });
  }

  const { data: questionRows } = await supabase
    .from("question_review_schedule")
    .select("question_id, correct_streak, next_review_at")
    .eq("user_id", userId)
    .eq("deck_id", deckId)
    .limit(MAX_ROWS);

  return NextResponse.json({
    topics: data || [],
    questions: questionRows || [],
  });
}
