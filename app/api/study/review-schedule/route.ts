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
    .select("deck_id, topic, status, correct_count, total_count, next_review_at")
    .eq("user_id", userId)
    .limit(MAX_ROWS);

  if (error) {
    // The table may not exist in this environment. "Nothing is due" is the
    // honest answer and keeps every screen that reads this usable.
    return NextResponse.json({ topics: [] });
  }

  return NextResponse.json({ topics: data || [] });
}
