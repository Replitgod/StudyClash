import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/server/apiUtils";

// Runs daily (see vercel.json). Scans topic_review_schedule for rows whose
// next_review_at has passed and that haven't been notified yet, and creates
// a challenge_notifications row ("srs_review_due") pointing straight at a
// weak-topic rematch for that deck. This is the async half of the SRS loop
// described in lib/srsSchedule.ts -- mastery-map computes the same schedule
// live in the browser, but nothing can "ping" a student who isn't looking at
// the page, so this cron is what actually closes the loop.
//
// Vercel Cron Jobs automatically send `Authorization: Bearer $CRON_SECRET`
// when the CRON_SECRET env var is set on the project -- set that env var to
// enable this check. If it's unset, the route stays open (fine for local/
// preview environments where cron never fires anyway).
const MAX_ROWS_PER_RUN = 200;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data: dueRows, error } = await supabase
    .from("topic_review_schedule")
    .select("id, user_id, player_name, deck_id, topic, status")
    .lte("next_review_at", nowIso)
    .is("notified_at", null)
    .limit(MAX_ROWS_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let notified = 0;

  for (const row of dueRows || []) {
    const actionHref = `/battle/${row.deck_id}?mode=weak_topic&topics=${encodeURIComponent(
      row.topic
    )}&limit=5`;
    const title =
      row.status === "weak" ? "A weak topic is due for review" : "Time for a quick review";
    const message = `Your "${row.topic}" review is due -- a short rematch keeps it from slipping.`;

    try {
      if (row.user_id) {
        await supabase.from("challenge_notifications").insert({
          target_user_id: row.user_id,
          deck_id: row.deck_id,
          event_type: "srs_review_due",
          title,
          message,
          action_href: actionHref,
          metadata: { topic: row.topic, status: row.status },
        });
      } else if (row.player_name) {
        await supabase.from("challenge_notifications").insert({
          target_player_name: row.player_name,
          deck_id: row.deck_id,
          event_type: "srs_review_due",
          title,
          message,
          action_href: actionHref,
          metadata: { topic: row.topic, status: row.status },
        });
      } else {
        continue;
      }

      await supabase
        .from("topic_review_schedule")
        .update({ notified_at: nowIso })
        .eq("id", row.id);

      notified += 1;
    } catch {
      // Best-effort per row -- one failure shouldn't stop the rest of the run.
    }
  }

  return NextResponse.json({ checked: dueRows?.length || 0, notified });
}
