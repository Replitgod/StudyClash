import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { generateStudyPlanTasks, type PlanIntensity } from "@/lib/studyPlanGenerator";
import { buildLiveResourceCatalog } from "@/lib/server/studyPlanResources";

export const runtime = "nodejs";
export const maxDuration = 30;

type GeneratePayload = {
  diagnosticAttemptId?: string;
  testDate?: string; // yyyy-mm-dd
  targetScore?: string;
  minutesPerWeekday?: number;
  minutesPerWeekend?: number;
  unavailableWeekdays?: number[];
  intensity?: PlanIntensity;
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as GeneratePayload;

  if (!body.diagnosticAttemptId || !body.testDate || !body.minutesPerWeekday) {
    return NextResponse.json(
      { error: "diagnosticAttemptId, testDate, and minutesPerWeekday are required." },
      { status: 400 }
    );
  }

  const testDate = new Date(`${body.testDate}T00:00:00`);
  if (Number.isNaN(testDate.getTime()) || testDate <= new Date()) {
    return NextResponse.json({ error: "testDate must be a valid future date." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .select("id, user_id, exam_id, status, estimated_score_low, estimated_score_high, exam:exam_definitions(name, slug)")
    .eq("id", body.diagnosticAttemptId)
    .single();

  if (attemptError || !attempt || attempt.user_id !== userId) {
    return NextResponse.json({ error: "Diagnostic attempt not found." }, { status: 404 });
  }

  if (attempt.status !== "completed") {
    return NextResponse.json({ error: "Finish the diagnostic before building a study plan." }, { status: 400 });
  }

  const examName = (attempt.exam as unknown as { name: string; slug: string })?.name || "Exam";
  const examSlug = (attempt.exam as unknown as { name: string; slug: string })?.slug || null;

  const { data: results } = await supabase
    .from("diagnostic_results")
    .select("weakest_skills, strongest_skills")
    .eq("attempt_id", body.diagnosticAttemptId)
    .single();

  const weakTopics = ((results?.weakest_skills || []) as { skill: string; accuracy: number }[]).map((s) => ({
    topic: s.skill,
    accuracy: s.accuracy,
  }));
  const strongTopics = ((results?.strongest_skills || []) as { skill: string }[]).map((s) => s.skill);

  const unavailableWeekdays = Array.isArray(body.unavailableWeekdays) ? body.unavailableWeekdays : [];
  const intensity: PlanIntensity = body.intensity || "balanced";
  const availableDays = WEEKDAY_NAMES.filter((_, idx) => !unavailableWeekdays.includes(idx));

  const resourceCatalog = await buildLiveResourceCatalog(weakTopics.map((t) => t.topic), supabase, examName);

  // Retakes key off (user, exam), not the specific diagnostic_attempt_id --
  // a retake is a NEW attempt id by definition, so matching on attempt id
  // would never find the earlier plan and would silently create a
  // duplicate every time a student retook the diagnostic. Matching on exam
  // is what lets a retake update the SAME plan instead.
  const { data: existingPlan } = await supabase
    .from("study_plans")
    .select("id, assessment_date")
    .eq("user_id", userId)
    .eq("exam_type", examSlug)
    .eq("source_type", "diagnostic")
    .eq("status", "active")
    .maybeSingle();

  if (existingPlan) {
    // Only regenerate FUTURE, not-yet-done work -- anything already
    // completed, or any day that's already passed, stays exactly as it
    // was. This is what "preserve completed history" actually means: a
    // retake changes what's ahead, not what already happened.
    const { error: deleteError } = await supabase
      .from("study_plan_tasks")
      .delete()
      .eq("study_plan_id", existingPlan.id)
      .eq("completed", false)
      .gte("scheduled_date", todayKey());

    if (deleteError) {
      return NextResponse.json({ error: "Failed to clear the old plan's upcoming tasks." }, { status: 500 });
    }

    const regeneratedTasks = generateStudyPlanTasks({
      startDate: new Date(),
      endDate: testDate,
      unavailableWeekdays,
      minutesPerWeekday: body.minutesPerWeekday,
      minutesPerWeekend: body.minutesPerWeekend || body.minutesPerWeekday,
      intensity,
      weakTopics,
      strongTopics,
      resourceCatalog,
    });

    if (regeneratedTasks.length === 0) {
      return NextResponse.json({ error: "There isn't enough time between now and the test date to update the plan." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("study_plans")
      .update({
        diagnostic_attempt_id: body.diagnosticAttemptId,
        assessment_date: body.testDate,
        target_score: body.targetScore || null,
        minutes_per_day: body.minutesPerWeekday,
        available_days: availableDays,
        weak_topics: weakTopics,
      })
      .eq("id", existingPlan.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update the study plan." }, { status: 500 });
    }

    const taskRows = regeneratedTasks.map((task) => ({
      study_plan_id: existingPlan.id,
      scheduled_date: task.scheduledDate,
      topic: task.topic,
      task_type: task.taskType,
      title: task.title,
      description: task.description,
      estimated_minutes: task.estimatedMinutes,
      resource_links: task.resourceLinks,
    }));

    const { error: insertError } = await supabase.from("study_plan_tasks").insert(taskRows);
    if (insertError) {
      return NextResponse.json({ error: "Failed to add the plan's updated tasks." }, { status: 500 });
    }

    return NextResponse.json({ planId: existingPlan.id, updated: true, taskCount: taskRows.length });
  }

  const generatedTasks = generateStudyPlanTasks({
    startDate: new Date(),
    endDate: testDate,
    unavailableWeekdays,
    minutesPerWeekday: body.minutesPerWeekday,
    minutesPerWeekend: body.minutesPerWeekend || body.minutesPerWeekday,
    intensity,
    weakTopics,
    strongTopics,
    resourceCatalog,
  });

  if (generatedTasks.length === 0) {
    return NextResponse.json({ error: "There isn't enough time between now and the test date to build a plan." }, { status: 400 });
  }

  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      source_type: "diagnostic",
      diagnostic_attempt_id: body.diagnosticAttemptId,
      title: `${examName} Study Plan`,
      exam_type: examSlug,
      assessment_type: "standardized_test",
      assessment_name: examName,
      assessment_date: body.testDate,
      target_score: body.targetScore || null,
      minutes_per_day: body.minutesPerWeekday,
      available_days: availableDays,
      weak_topics: weakTopics,
      status: "active",
    })
    .select("id")
    .single();

  if (planError || !plan) {
    return NextResponse.json({ error: planError?.message || "Failed to create the study plan." }, { status: 500 });
  }

  const taskRows = generatedTasks.map((task) => ({
    study_plan_id: plan.id,
    scheduled_date: task.scheduledDate,
    topic: task.topic,
    task_type: task.taskType,
    title: task.title,
    description: task.description,
    estimated_minutes: task.estimatedMinutes,
    resource_links: task.resourceLinks,
  }));

  const { error: tasksError } = await supabase.from("study_plan_tasks").insert(taskRows);
  if (tasksError) {
    await supabase.from("study_plans").delete().eq("id", plan.id);
    return NextResponse.json({ error: "Failed to create the study plan's tasks." }, { status: 500 });
  }

  return NextResponse.json({ planId: plan.id, updated: false, taskCount: taskRows.length });
}
