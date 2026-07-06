import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This client uses the SERVICE ROLE key, which is safe here because
// this code only ever runs on the server (inside this API route).
// Never send the service role key to the browser.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Parses the comma-separated ADMIN_EMAILS env var into a clean, lowercased
// list for case-insensitive comparison. This env var is server-only —
// it has no NEXT_PUBLIC_ prefix, so it's never exposed to the browser.
function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

// Counts rows in analytics_events matching a specific event_name, created
// today. Returns 0 on error rather than throwing, so one bad event-name
// count doesn't take down the whole stats response — errors are still
// collected by the caller for logging.
async function countEventToday(
  eventName: string,
  startOfTodayIso: string
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("event_name", eventName)
    .gte("created_at", startOfTodayIso);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count || 0, error: null };
}

export async function GET(req: NextRequest) {
  try {
    // 1. Read the Authorization Bearer token
    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Please log in to access the admin dashboard." },
        { status: 401 }
      );
    }

    // 2. Verify the user via Supabase Auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Please log in to access the admin dashboard." },
        { status: 401 }
      );
    }

    // 3. Check if this user's email is in the admin allowlist
    const adminEmails = getAdminEmails();
    const userEmail = (user.email || "").toLowerCase();

    if (!adminEmails.includes(userEmail)) {
      return NextResponse.json(
        { error: "You do not have admin access." },
        { status: 403 }
      );
    }

    // 4. Gather stats. "Today" is midnight local server time up to now.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayIso = startOfToday.toISOString();

    const [
      totalUsersResult,
      totalDecksResult,
      totalBattlesResult,
      totalFeedbackResult,
      totalQuestionReportsResult,
      decksTodayResult,
      battlesTodayResult,
      generationsTodayResult,
      recentFeedbackResult,
      recentQuestionReportsResult,
      recentDecksResult,
      // Analytics: total events today
      eventsTodayResult,
      // Analytics: per-event-name counts today
      pageViewsTodayResult,
      deckGenStartedTodayResult,
      deckGenSuccessTodayResult,
      deckGenFailedTodayResult,
      battleStartedTodayResult,
      battleFinishedTodayResult,
      feedbackSubmittedTodayResult,
      questionReportSubmittedTodayResult,
      // Analytics: latest 20 raw events
      recentEventsResult,
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("decks").select("id", { count: "exact", head: true }),
      supabase.from("matches").select("id", { count: "exact", head: true }),
      supabase
        .from("feedback_reports")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("question_reports")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("decks")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfTodayIso),
      supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfTodayIso),
      supabase
        .from("generation_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfTodayIso),
      supabase
        .from("feedback_reports")
        .select("id, message, page_url, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("question_reports")
        .select("id, question_id, deck_id, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("decks")
        .select("id, title, course_name, student_name, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfTodayIso),
      countEventToday("page_view", startOfTodayIso),
      countEventToday("deck_generation_started", startOfTodayIso),
      countEventToday("deck_generation_success", startOfTodayIso),
      countEventToday("deck_generation_failed", startOfTodayIso),
      countEventToday("battle_started", startOfTodayIso),
      countEventToday("battle_finished", startOfTodayIso),
      countEventToday("feedback_submitted", startOfTodayIso),
      countEventToday("question_report_submitted", startOfTodayIso),
      supabase
        .from("analytics_events")
        .select("id, user_id, event_name, page_url, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Collect any query errors so a single failing table doesn't silently
    // hide the fact that the response is incomplete.
    const queryErrors = [
      totalUsersResult.error,
      totalDecksResult.error,
      totalBattlesResult.error,
      totalFeedbackResult.error,
      totalQuestionReportsResult.error,
      decksTodayResult.error,
      battlesTodayResult.error,
      generationsTodayResult.error,
      recentFeedbackResult.error,
      recentQuestionReportsResult.error,
      recentDecksResult.error,
      eventsTodayResult.error,
      pageViewsTodayResult.error,
      deckGenStartedTodayResult.error,
      deckGenSuccessTodayResult.error,
      deckGenFailedTodayResult.error,
      battleStartedTodayResult.error,
      battleFinishedTodayResult.error,
      feedbackSubmittedTodayResult.error,
      questionReportSubmittedTodayResult.error,
      recentEventsResult.error,
    ].filter((e) => e !== null && e !== undefined);

    if (queryErrors.length > 0) {
      console.error("Admin stats query errors:", queryErrors);
      return NextResponse.json(
        { error: "Failed to load some admin data. Check server logs." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      stats: {
        totalUsers: totalUsersResult.count || 0,
        totalDecks: totalDecksResult.count || 0,
        totalBattles: totalBattlesResult.count || 0,
        totalFeedbackReports: totalFeedbackResult.count || 0,
        totalQuestionReports: totalQuestionReportsResult.count || 0,
        decksToday: decksTodayResult.count || 0,
        battlesToday: battlesTodayResult.count || 0,
        generationsToday: generationsTodayResult.count || 0,
      },
      analytics: {
        eventsToday: eventsTodayResult.count || 0,
        pageViewsToday: pageViewsTodayResult.count,
        deckGenerationStartedToday: deckGenStartedTodayResult.count,
        deckGenerationSuccessToday: deckGenSuccessTodayResult.count,
        deckGenerationFailedToday: deckGenFailedTodayResult.count,
        battleStartedToday: battleStartedTodayResult.count,
        battleFinishedToday: battleFinishedTodayResult.count,
        feedbackSubmittedToday: feedbackSubmittedTodayResult.count,
        questionReportSubmittedToday: questionReportSubmittedTodayResult.count,
      },
      recent: {
        feedback: recentFeedbackResult.data || [],
        questionReports: recentQuestionReportsResult.data || [],
        decks: recentDecksResult.data || [],
        events: recentEventsResult.data || [],
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}