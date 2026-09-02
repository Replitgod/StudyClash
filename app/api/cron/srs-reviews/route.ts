import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, isAuthorizedCronRequest } from "@/lib/server/apiUtils";
import { drainEmailQueue } from "@/lib/server/emailQueue";

// Runs daily (see vercel.json). Scans topic_review_schedule for rows whose
// next_review_at has passed and that haven't been notified yet, and creates
// a challenge_notifications row ("srs_review_due") pointing straight at a
// weak-topic rematch for that deck. This is the async half of the SRS loop
// described in lib/srsSchedule.ts -- mastery-map computes the same schedule
// live in the browser, but nothing can "ping" a student who isn't looking at
// the page, so this cron is what actually closes the loop.
//
// Vercel Cron Jobs automatically send `Authorization: Bearer $CRON_SECRET`
// when the CRON_SECRET env var is set on the project. Authorization lives in
// isAuthorizedCronRequest (lib/server/apiUtils.ts), which stays open in
// local/preview environments and closed in production.
const MAX_ROWS_PER_RUN = 200;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
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
    console.error("srs-reviews cron failed to load due rows:", error.message);
    return NextResponse.json({ error: "Could not load due reviews." }, { status: 500 });
  }

  let notified = 0;
  let emailsQueued = 0;

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

      // The in-app notification above only reaches a student who comes
      // back on their own. The whole point of a spaced-repetition nudge is
      // to reach the one who did not, so a signed-in student also gets an
      // email -- queued here, delivered by /api/cron/send-emails.
      //
      // Guests (player_name, no user_id) have no address and are skipped:
      // the queue would fail those rows permanently anyway.
      if (row.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, display_name")
          .eq("id", row.user_id)
          .maybeSingle();

        if (profile?.email) {
          await supabase.from("email_notification_queue").insert({
            recipient_email: profile.email,
            recipient_player_name: profile.display_name || null,
            event_type: "srs_review_due",
            subject: title,
            body: `${message}

It takes about five minutes, and it is the difference between recognising this topic and remembering it.`,
            action_href: actionHref,
            metadata: { topic: row.topic, status: row.status, deckId: row.deck_id },
          });
          emailsQueued += 1;
        }
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

  // Drain the queue in the same invocation. Vercel Hobby allows only two
  // cron jobs and this app already uses both, so the mail this run just
  // queued goes out now rather than waiting for a third schedule that
  // cannot exist. See lib/server/emailQueue.ts.
  const email = await drainEmailQueue();

  return NextResponse.json({
    checked: dueRows?.length || 0,
    notified,
    emailsQueued,
    email,
  });
}
