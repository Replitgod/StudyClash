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
      classroomRoomCreatedTodayResult,
      classroomInviteCopiedTodayResult,
      classroomJoinSuccessTodayResult,
      enterpriseLeadSubmittedTodayResult,
      challengeLinkCopiedTodayResult,
      challengeLinkOpenedTodayResult,
      diagnosticStartedTodayResult,
      diagnosticCompletedTodayResult,
      diagnosticResultsViewedTodayResult,
      resourceClickedTodayResult,
      studyPlanCreatedTodayResult,
      // Analytics: latest 20 raw events
      recentEventsResult,
      // Retention: rolling day-7 cohort (see 20260715_day7_retention.sql)
      day7RetentionResult,
      // Diagnostic center + study plans (see 20260715_diagnostics_and_study_plans.sql)
      totalDiagnosticAttemptsResult,
      completedDiagnosticAttemptsResult,
      recentDiagnosticResultsResult,
      totalStudyPlansResult,
      totalStudyPlanTasksResult,
      completedStudyPlanTasksResult,
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
      countEventToday("classroom_room_created", startOfTodayIso),
      countEventToday("classroom_invite_copied", startOfTodayIso),
      countEventToday("classroom_join_success", startOfTodayIso),
      countEventToday("enterprise_lead_submitted", startOfTodayIso),
      countEventToday("challenge_link_copied", startOfTodayIso),
      countEventToday("challenge_link_opened", startOfTodayIso),
      countEventToday("diagnostic_started", startOfTodayIso),
      countEventToday("diagnostic_completed", startOfTodayIso),
      countEventToday("diagnostic_results_viewed", startOfTodayIso),
      countEventToday("recommended_resource_clicked", startOfTodayIso),
      countEventToday("study_plan_created", startOfTodayIso),
      supabase
        .from("analytics_events")
        .select("id, user_id, event_name, page_url, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      (() => {
        const cohortEnd = new Date(startOfToday);
        cohortEnd.setDate(cohortEnd.getDate() - 7);
        const cohortStart = new Date(cohortEnd);
        cohortStart.setDate(cohortStart.getDate() - 14);
        return supabase.rpc("compute_day7_retention", {
          cohort_start: cohortStart.toISOString(),
          cohort_end: cohortEnd.toISOString(),
        });
      })(),
      supabase.from("diagnostic_attempts").select("id", { count: "exact", head: true }),
      supabase
        .from("diagnostic_attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("diagnostic_results")
        .select("estimated_score_low, estimated_score_high, weakest_skills")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("study_plans").select("id", { count: "exact", head: true }),
      supabase.from("study_plan_tasks").select("id", { count: "exact", head: true }),
      supabase
        .from("study_plan_tasks")
        .select("id", { count: "exact", head: true })
        .eq("completed", true),
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
      classroomRoomCreatedTodayResult.error,
      classroomInviteCopiedTodayResult.error,
      classroomJoinSuccessTodayResult.error,
      enterpriseLeadSubmittedTodayResult.error,
      challengeLinkCopiedTodayResult.error,
      challengeLinkOpenedTodayResult.error,
      diagnosticStartedTodayResult.error,
      diagnosticCompletedTodayResult.error,
      diagnosticResultsViewedTodayResult.error,
      resourceClickedTodayResult.error,
      studyPlanCreatedTodayResult.error,
      recentEventsResult.error,
      totalDiagnosticAttemptsResult.error,
      completedDiagnosticAttemptsResult.error,
      recentDiagnosticResultsResult.error,
      totalStudyPlansResult.error,
      totalStudyPlanTasksResult.error,
      completedStudyPlanTasksResult.error,
      // day7RetentionResult is intentionally excluded from this hard-fail
      // list: retention is a "nice to have" analytics figure, not core
      // dashboard data, and cohort_size legitimately hits 0 (returning a
      // null retention_rate, not an error) for a brand-new app with no
      // users old enough yet -- that shouldn't take down the whole
      // dashboard the way a real query error should.
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
        classroomRoomCreatedToday: classroomRoomCreatedTodayResult.count,
        classroomInviteCopiedToday: classroomInviteCopiedTodayResult.count,
        classroomJoinSuccessToday: classroomJoinSuccessTodayResult.count,
        enterpriseLeadSubmittedToday: enterpriseLeadSubmittedTodayResult.count,
        challengeLinkCopiedToday: challengeLinkCopiedTodayResult.count,
        challengeLinkOpenedToday: challengeLinkOpenedTodayResult.count,
        diagnosticStartedToday: diagnosticStartedTodayResult.count,
        diagnosticCompletedToday: diagnosticCompletedTodayResult.count,
        diagnosticResultsViewedToday: diagnosticResultsViewedTodayResult.count,
        resourceClickedToday: resourceClickedTodayResult.count,
        studyPlanCreatedToday: studyPlanCreatedTodayResult.count,
      },
      diagnostics: (() => {
        const totalAttempts = totalDiagnosticAttemptsResult.count || 0;
        const completedAttempts = completedDiagnosticAttemptsResult.count || 0;
        const completionRatePercent =
          totalAttempts > 0 ? Math.round((completedAttempts / totalAttempts) * 1000) / 10 : null;

        const resultsSample = (recentDiagnosticResultsResult.data || []) as {
          estimated_score_low: number | null;
          estimated_score_high: number | null;
          weakest_skills: { skill: string; accuracy: number }[] | null;
        }[];

        const scoredRows = resultsSample.filter(
          (r) => typeof r.estimated_score_low === "number" && typeof r.estimated_score_high === "number"
        );
        const averageEstimatedLow =
          scoredRows.length > 0
            ? Math.round(scoredRows.reduce((sum, r) => sum + (r.estimated_score_low || 0), 0) / scoredRows.length)
            : null;
        const averageEstimatedHigh =
          scoredRows.length > 0
            ? Math.round(scoredRows.reduce((sum, r) => sum + (r.estimated_score_high || 0), 0) / scoredRows.length)
            : null;

        // Most common weak skills across the most recent 200 diagnostic
        // results -- a simple frequency count, not a new SQL aggregate
        // function, since this only needs to run once per admin page load.
        const weakSkillCounts = new Map<string, number>();
        resultsSample.forEach((row) => {
          (row.weakest_skills || []).forEach((entry) => {
            weakSkillCounts.set(entry.skill, (weakSkillCounts.get(entry.skill) || 0) + 1);
          });
        });
        const mostCommonWeakSkills = Array.from(weakSkillCounts.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 8)
          .map(([skill, count]) => ({ skill, count }));

        const totalTasks = totalStudyPlanTasksResult.count || 0;
        const completedTasks = completedStudyPlanTasksResult.count || 0;
        const taskCompletionRatePercent =
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 1000) / 10 : null;

        const resourceClicks = resourceClickedTodayResult.count || 0;
        const resultsViews = diagnosticResultsViewedTodayResult.count || 0;
        const resourceClickRatePercent =
          resultsViews > 0 ? Math.round((resourceClicks / resultsViews) * 1000) / 10 : null;

        return {
          totalAttempts,
          completedAttempts,
          completionRatePercent,
          averageEstimatedLow,
          averageEstimatedHigh,
          mostCommonWeakSkills,
          plansCreated: totalStudyPlansResult.count || 0,
          taskCompletionRatePercent,
          resourceClickRatePercent,
        };
      })(),
      recent: {
        feedback: recentFeedbackResult.data || [],
        questionReports: recentQuestionReportsResult.data || [],
        decks: recentDecksResult.data || [],
        events: recentEventsResult.data || [],
      },
      retention: (() => {
        if (day7RetentionResult.error) {
          console.error("day7 retention query failed:", day7RetentionResult.error.message);
          return null;
        }
        const row = day7RetentionResult.data?.[0] as
          | { cohort_size: number; retained_size: number; retention_rate: number | null }
          | undefined;
        if (!row) return null;
        return {
          day7CohortSize: row.cohort_size,
          day7RetainedSize: row.retained_size,
          day7RetentionRatePercent: row.retention_rate,
        };
      })(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}