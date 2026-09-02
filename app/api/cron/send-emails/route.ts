import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, isAuthorizedCronRequest } from "@/lib/server/apiUtils";
import { deliver, isEmailConfigured, type QueuedEmail } from "@/lib/server/email";

// The consumer email_notification_queue never had.
//
// Producers have been inserting into that table since 20260709 and nothing
// has ever read it, so every notification the product appears to send has
// been sitting at status 'queued' since then. This drains it.
//
// Runs on the same cron schedule as the other jobs (see vercel.json) and is
// guarded by the same shared secret. Safe to call more than once: a row is
// only moved off 'queued' once its outcome is known.

export const runtime = "nodejs";
export const maxDuration = 60;

/** Kept well inside maxDuration -- the provider is one request per row. */
const MAX_PER_RUN = 50;

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: rows, error } = await supabase
    .from("email_notification_queue")
    .select("id, recipient_email, recipient_player_name, event_type, subject, body, action_href")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error("send-emails: could not read the queue:", error.message);
    return NextResponse.json({ error: "Could not read the queue." }, { status: 500 });
  }

  const queued = (rows || []) as QueuedEmail[];
  if (queued.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: 0, remaining: 0 });
  }

  // Say so once per run rather than once per row, and keep the rows queued.
  if (!isEmailConfigured()) {
    console.error(
      `send-emails: ${queued.length} notification(s) are waiting but RESEND_API_KEY / EMAIL_FROM are not set. ` +
        "Nothing was sent, and nothing was discarded -- set both and they will go out on the next run."
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
      // The mail went out but the row still says 'queued'. Log loudly:
      // the next run would send it again, and a duplicate is the one
      // failure mode a person actually notices.
      console.error(
        `send-emails: ${email.id} was ${outcome.status} but the row could not be updated (${updateError.message}). ` +
          "It may be delivered twice."
      );
    }

    if (outcome.status === "sent") {
      sent += 1;
    } else {
      failed += 1;
      console.error(`send-emails: ${email.id} (${email.event_type}) failed -- ${outcome.reason}`);
    }
  }

  const { count: remaining } = await supabase
    .from("email_notification_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  return NextResponse.json({ sent, failed, skipped, remaining: remaining ?? 0 });
}
