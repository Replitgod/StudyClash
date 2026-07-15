import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { computeAvailableDates } from "@/lib/studyPlanGenerator";

export const runtime = "nodejs";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Spreads every overdue, incomplete task round-robin across the plan's
// remaining available days, instead of dumping them all onto today --
// "do not overload one day with all missed work" is an explicit product
// requirement, not just a nice-to-have.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const { planId } = await params;
  const supabase = getServiceSupabaseClient();

  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .select("id, user_id, assessment_date, available_days, status")
    .eq("id", planId)
    .single();

  if (planError || !plan || plan.user_id !== userId) {
    return NextResponse.json({ error: "Study plan not found." }, { status: 404 });
  }

  if (plan.status !== "active") {
    return NextResponse.json({ error: "Only active plans can be rebalanced." }, { status: 400 });
  }

  const { data: overdueTasks, error: overdueError } = await supabase
    .from("study_plan_tasks")
    .select("id")
    .eq("study_plan_id", planId)
    .eq("completed", false)
    .lt("scheduled_date", todayKey())
    .order("scheduled_date", { ascending: true });

  if (overdueError) {
    return NextResponse.json({ error: "Failed to load overdue tasks." }, { status: 500 });
  }

  if (!overdueTasks || overdueTasks.length === 0) {
    return NextResponse.json({ rebalanced: 0 });
  }

  const availableDayNames = new Set((plan.available_days as string[]) || WEEKDAY_NAMES);
  const unavailableWeekdays = WEEKDAY_NAMES.map((_, idx) => idx).filter(
    (idx) => !availableDayNames.has(WEEKDAY_NAMES[idx])
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const futureDates = computeAvailableDates({
    startDate: tomorrow,
    endDate: new Date(`${plan.assessment_date}T00:00:00`),
    unavailableWeekdays,
  });

  if (futureDates.length === 0) {
    return NextResponse.json({ error: "No remaining available days before the assessment date." }, { status: 400 });
  }

  const updates = overdueTasks.map((task, idx) => ({
    id: task.id,
    scheduled_date: futureDates[idx % futureDates.length].toISOString().slice(0, 10),
  }));

  for (const update of updates) {
    await supabase
      .from("study_plan_tasks")
      .update({ scheduled_date: update.scheduled_date })
      .eq("id", update.id);
  }

  return NextResponse.json({ rebalanced: updates.length });
}
