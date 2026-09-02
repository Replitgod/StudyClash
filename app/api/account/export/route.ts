import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

// Everything AceDecks holds about you, as one file.
//
// The other half of the data-rights pair: DELETE /api/account already
// existed, and "you can delete it" without "you can see it" is the half
// that is easy to build. It is also the first thing a school's procurement
// form asks about, and the GDPR/CCPA right it maps to (portability) is
// separate from erasure.
//
// Deliberately a plain JSON download rather than an emailed archive: it is
// synchronous, needs no queue or storage bucket, and a student gets their
// data in one click instead of waiting on a job.
//
// Every query is scoped by the caller's own id. The service client bypasses
// RLS, so the `.eq("user_id", userId)` on each table IS the authorization
// here -- a missing one would export somebody else's study history.

export const runtime = "nodejs";

/** Bounded so one account cannot pull an unbounded amount in one request. */
const MAX_ROWS_PER_TABLE = 5_000;

/** An export is a heavy read; nobody needs one every few seconds. */
const EXPORTS_PER_HOUR = 5;

/**
 * Tables keyed directly by the owner's user id.
 *
 * Anything NOT listed here is excluded on purpose: internal logs
 * (generation_logs, analytics_events), other people's rows, and derived
 * caches that carry no information the student did not already give us.
 */
const OWNED_TABLES: Array<{ table: string; columns: string; orderBy?: string }> = [
  { table: "profiles", columns: "id, email, display_name, plan, created_at", orderBy: undefined },
  { table: "decks", columns: "id, title, course_name, raw_notes, is_public, share_slug, created_at", orderBy: "created_at" },
  { table: "matches", columns: "id, deck_id, score, correct_answers, total_questions, time_taken_seconds, created_at", orderBy: "created_at" },
  { table: "diagnostic_attempts", columns: "id, exam_id, status, mode, created_at", orderBy: "created_at" },
  { table: "diagnostic_results", columns: "id, attempt_id, overall_accuracy, created_at", orderBy: "created_at" },
  { table: "study_plans", columns: "id, title, status, created_at", orderBy: "created_at" },
  { table: "topic_review_schedule", columns: "id, deck_id, topic, status, next_review_at", orderBy: "next_review_at" },
  { table: "mistake_breakdowns", columns: "id, deck_id, topic, created_at", orderBy: "created_at" },
  { table: "player_progress", columns: "user_id, xp, level, current_streak_days, updated_at" },
  { table: "xp_events", columns: "id, amount, reason, created_at", orderBy: "created_at" },
];

export async function GET(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkDistributedRateLimit({
    key: `account-export:${userId}`,
    limit: EXPORTS_PER_HOUR,
    windowSeconds: 3600,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "You have downloaded your data a few times just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const supabase = getServiceSupabaseClient();
  const data: Record<string, unknown> = {};
  const unavailable: string[] = [];

  for (const spec of OWNED_TABLES) {
    const key = spec.table === "profiles" ? "id" : "user_id";
    let query = supabase.from(spec.table).select(spec.columns).eq(key, userId);
    if (spec.orderBy) query = query.order(spec.orderBy, { ascending: true });

    const { data: rows, error } = await query.limit(MAX_ROWS_PER_TABLE);

    if (error) {
      // A table this deployment has not migrated yet must not fail the
      // whole export -- the student still gets everything else, and the
      // response says plainly what is missing rather than quietly omitting it.
      unavailable.push(spec.table);
      continue;
    }

    data[spec.table] = rows ?? [];
  }

  // Deck questions are keyed by deck, not by user, so they need the ids.
  const deckIds = Array.isArray(data.decks)
    ? (data.decks as Array<{ id: string }>).map((deck) => deck.id)
    : [];

  if (deckIds.length > 0) {
    const { data: questions, error } = await supabase
      .from("questions")
      .select("id, deck_id, question_text, answer_choices, correct_answer, explanation, topic, difficulty")
      .in("deck_id", deckIds)
      .limit(MAX_ROWS_PER_TABLE);

    if (error) unavailable.push("questions");
    else data.questions = questions ?? [];
  } else {
    data.questions = [];
  }

  const body = {
    exported_at: new Date().toISOString(),
    account_id: userId,
    note:
      "Everything AceDecks holds that belongs to you. Internal logs and other " +
      "people's data are not included. Match results you played keep their " +
      "scores but are detached from your account if you delete it.",
    ...(unavailable.length > 0 ? { unavailable } : {}),
    data,
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="acedecks-data-${stamp}.json"`,
      // Never let a CDN or browser hold a copy of somebody's study history.
      "Cache-Control": "no-store, private",
    },
  });
}
