import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, isAuthorizedCronRequest } from "@/lib/server/apiUtils";
import { drainEmailQueue } from "@/lib/server/emailQueue";
import { sessionHref } from "@/lib/nextAction";

// Runs daily (see vercel.json). Finds topics whose review date has passed
// and that have not been reminded about yet, and sends each student ONE
// reminder -- in-app and by email -- that goes straight into a session on
// those topics. The review dates themselves come from the mastery model
// (lib/server/studyEvidence.ts); this is the half of spaced review that
// reaches a student who is not looking at the app.
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

  // One reminder per student per run, however many topics fell due. This
  // used to send one notification and one email PER TOPIC, so a student
  // with ten topics due got ten emails in a morning -- the fastest way to
  // teach someone to ignore the one reminder that matters.
  type DueRow = {
    id: string;
    user_id: string | null;
    player_name: string | null;
    deck_id: string;
    topic: string;
    status: string;
  };
  const groups = new Map<string, DueRow[]>();
  for (const row of (dueRows || []) as DueRow[]) {
    const owner = row.user_id ? `u:${row.user_id}` : row.player_name ? `p:${row.player_name}` : null;
    if (!owner) continue;
    const list = groups.get(owner) || [];
    list.push(row);
    groups.set(owner, list);
  }

  const userIds = Array.from(
    new Set(
      Array.from(groups.values())
        .map((rows) => rows[0].user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, email, display_name").in("id", userIds)
    : { data: [] as Array<{ id: string; email: string | null; display_name: string | null }> };
  const profileById = new Map(
    ((profiles || []) as Array<{ id: string; email: string | null; display_name: string | null }>).map((p) => [
      p.id,
      p,
    ])
  );

  for (const rows of groups.values()) {
    const first = rows[0];
    const topics = Array.from(new Set(rows.map((r) => r.topic)));
    const sameDeck = rows.every((r) => r.deck_id === first.deck_id);

    // Straight into a session on exactly these topics when they share a
    // set; otherwise Home, which already puts the most urgent one first.
    const actionHref = sameDeck
      ? sessionHref({ deckId: first.deck_id, topics, mode: "weak_topic", limit: 10 })
      : "/home";

    const title =
      topics.length === 1
        ? `"${topics[0]}" is due for review`
        : `${topics.length} topics are due for review`;
    const listed = topics.slice(0, 3).map((t) => `"${t}"`).join(", ");
    const more = topics.length > 3 ? ` and ${topics.length - 3} more` : "";
    const message =
      topics.length === 1
        ? `It's been long enough that "${topics[0]}" is starting to fade. A few questions now keep it.`
        : `${listed}${more} are starting to fade. A few questions now keep them.`;

    try {
      if (first.user_id) {
        await supabase.from("challenge_notifications").insert({
          target_user_id: first.user_id,
          deck_id: sameDeck ? first.deck_id : null,
          event_type: "srs_review_due",
          title,
          message,
          action_href: actionHref,
          metadata: { topics, deckIds: Array.from(new Set(rows.map((r) => r.deck_id))) },
        });

        // The in-app notification only reaches a student who comes back on
        // their own. The point of a spaced-review reminder is to reach the
        // one who did not, so a signed-in student also gets an email.
        const profile = profileById.get(first.user_id);
        if (profile?.email) {
          await supabase.from("email_notification_queue").insert({
            recipient_email: profile.email,
            recipient_player_name: profile.display_name || null,
            event_type: "srs_review_due",
            subject: title,
            body: `${message}

It takes about five minutes. Reviewing right as something starts to fade is what moves it into long-term memory.`,
            action_href: actionHref,
            metadata: { topics },
          });
          emailsQueued += 1;
        }
      } else if (first.player_name) {
        await supabase.from("challenge_notifications").insert({
          target_player_name: first.player_name,
          deck_id: sameDeck ? first.deck_id : null,
          event_type: "srs_review_due",
          title,
          message,
          action_href: actionHref,
          metadata: { topics },
        });
      }

      await supabase
        .from("topic_review_schedule")
        .update({ notified_at: nowIso })
        .in(
          "id",
          rows.map((r) => r.id)
        );

      notified += 1;
    } catch {
      // Best-effort per student -- one failure shouldn't stop the rest of the run.
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
