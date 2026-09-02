import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { deliver, isEmailConfigured, type QueuedEmail } from "@/lib/server/email";

// Draining email_notification_queue, as a plain function.
//
// It lives here rather than inside the route because Vercel's Hobby plan
// allows only TWO cron jobs, and this app already uses both (srs-reviews,
// curriculum/process). A third entry in vercel.json is a deployment error,
// not a third job -- so the drain runs at the end of the SRS cron, which is
// the one that queues most of the mail in the first place.
//
// /api/cron/send-emails still exists and calls this, for manual triggering
// and for whenever the project moves to a plan with more cron slots.

export type DrainResult = {
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
};

/** Kept well inside a 60s invocation -- one provider request per row. */
const MAX_PER_RUN = 50;

export async function drainEmailQueue(): Promise<DrainResult> {
  const supabase = getServiceSupabaseClient();

  const { data: rows, error } = await supabase
    .from("email_notification_queue")
    .select("id, recipient_email, recipient_player_name, event_type, subject, body, action_href")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error("email queue: could not read the queue:", error.message);
    return { sent: 0, failed: 0, skipped: 0, remaining: 0 };
  }

  const queued = (rows || []) as QueuedEmail[];
  if (queued.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, remaining: 0 };
  }

  // Said once per run rather than once per row, and the rows stay queued.
  if (!isEmailConfigured()) {
    console.error(
      `email queue: ${queued.length} notification(s) are waiting but RESEND_API_KEY / EMAIL_FROM are not set. ` +
        "Nothing was sent, and nothing was discarded -- set both and they go out on the next run."
    );
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const email of queued) {
    const outcome = await deliver(email);

    if (outcome.status === "skipped") {
      // Left 'queued' deliberately: a transient provider problem or missing
      // configuration should retry, not silently drop someone's mail.
      skipped += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("email_notification_queue")
      .update({
        status: outcome.status,
        sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", email.id);

    if (updateError) {
      // The mail went out but the row still says 'queued'. Log loudly: the
      // next run would send it again, and a duplicate is the one failure
      // mode a person actually notices.
      console.error(
        `email queue: ${email.id} was ${outcome.status} but the row could not be updated (${updateError.message}). ` +
          "It may be delivered twice."
      );
    }

    if (outcome.status === "sent") {
      sent += 1;
    } else {
      failed += 1;
      console.error(`email queue: ${email.id} (${email.event_type}) failed -- ${outcome.reason}`);
    }
  }

  const { count: remaining } = await supabase
    .from("email_notification_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  return { sent, failed, skipped, remaining: remaining ?? 0 };
}
