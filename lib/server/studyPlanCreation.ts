import type { SupabaseClient } from "@supabase/supabase-js";
import { generateShortTermPlanTasks } from "@/lib/studyPlanGenerator";
import { buildLiveResourceCatalog } from "@/lib/server/studyPlanResources";

export type ShortTermPlanAssessmentType =
  | "quiz"
  | "unit_test"
  | "midterm"
  | "final_exam"
  | "assignment"
  | "presentation"
  | "standardized_test";

export const SHORT_TERM_PLAN_ASSESSMENT_TYPES: ShortTermPlanAssessmentType[] = [
  "quiz",
  "unit_test",
  "midterm",
  "final_exam",
  "assignment",
  "presentation",
  "standardized_test",
];

export type CreateShortTermPlanResult =
  | {
      ok: true;
      planId: string;
      alreadyExisted: boolean;
      nextBestAction?: { title: string; description: string };
    }
  | { ok: false; error: string; status: number };

// Shared by app/api/study-plans/generate-short-term/route.ts (the dedicated
// "Plan for an assessment" form) and app/api/vyra-chat/route.ts (VYRA's
// study_plan tool action) so there's exactly one implementation of "create a
// short-term plan for this match" -- two independent copies of this logic
// already drifted once before elsewhere in this codebase (see planLimits.ts).
export async function createShortTermStudyPlan(args: {
  supabase: SupabaseClient;
  userId: string;
  matchId: string;
  assessmentType: ShortTermPlanAssessmentType;
  assessmentName?: string;
  dueDate: string; // yyyy-mm-dd
  minutesPerDay?: number;
  goal?: string;
}): Promise<CreateShortTermPlanResult> {
  const { supabase, userId, matchId, assessmentType, assessmentName, dueDate, minutesPerDay, goal } = args;

  const parsedDueDate = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(parsedDueDate.getTime())) {
    return { ok: false, error: "dueDate must be a valid date.", status: 400 };
  }

  const { data: existingPlan } = await supabase
    .from("study_plans")
    .select("id")
    .eq("match_id", matchId)
    .eq("status", "active")
    .maybeSingle();

  if (existingPlan) {
    return { ok: true, planId: existingPlan.id, alreadyExisted: true };
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, user_id, deck_id, correct_answers, total_questions, deck:decks(title, course_name)")
    .eq("id", matchId)
    .single();

  if (matchError || !match || match.user_id !== userId) {
    return { ok: false, error: "Match not found.", status: 404 };
  }

  const deckInfo = match.deck as unknown as { title: string; course_name: string | null };
  const deckTitle = deckInfo?.title || "your deck";

  // This match's own missed questions, weighted with this deck's broader
  // weak/improving/mastered history -- not just "what you got wrong once."
  const { data: answerRows } = await supabase
    .from("match_answers")
    .select("is_correct, question:questions(topic)")
    .eq("match_id", matchId);

  const topicAccuracy = new Map<string, { correct: number; total: number }>();
  (answerRows || []).forEach((row) => {
    const topic = (row.question as unknown as { topic: string })?.topic;
    if (!topic) return;
    const entry = topicAccuracy.get(topic) || { correct: 0, total: 0 };
    entry.total += 1;
    if (row.is_correct) entry.correct += 1;
    topicAccuracy.set(topic, entry);
  });

  const { data: deckHistory } = await supabase
    .from("topic_review_schedule")
    .select("topic, status, correct_count, total_count")
    .eq("user_id", userId)
    .eq("deck_id", match.deck_id);

  (deckHistory || []).forEach((row) => {
    if (topicAccuracy.has(row.topic)) return;
    if (row.total_count > 0) {
      topicAccuracy.set(row.topic, { correct: row.correct_count, total: row.total_count });
    }
  });

  const weakTopics = Array.from(topicAccuracy.entries())
    .map(([topic, stats]) => ({ topic, accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 100 }))
    .sort((a, b) => a.accuracy - b.accuracy);

  if (weakTopics.length === 0) {
    return {
      ok: false,
      error: "No topic data was found for this deck yet -- battle again to build a weak-topic profile.",
      status: 400,
    };
  }

  const resolvedMinutesPerDay = minutesPerDay && minutesPerDay > 0 ? minutesPerDay : 25;

  const resourceCatalog = await buildLiveResourceCatalog(
    weakTopics.slice(0, 3).map((t) => t.topic),
    supabase,
    deckInfo?.course_name || undefined
  );

  const generatedTasks = generateShortTermPlanTasks({
    today: new Date(),
    dueDate: parsedDueDate,
    weakTopics,
    deckId: match.deck_id,
    deckTitle,
    minutesPerDay: resolvedMinutesPerDay,
    resourceCatalog,
  });

  if (generatedTasks.length === 0) {
    return { ok: false, error: "Could not build a plan for this due date.", status: 400 };
  }

  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      source_type: "battle_assessment",
      match_id: matchId,
      title: assessmentName ? `${assessmentName} Prep` : `${deckTitle} Prep`,
      assessment_type: assessmentType,
      assessment_name: assessmentName || null,
      assessment_date: dueDate,
      target_score: goal || null,
      minutes_per_day: resolvedMinutesPerDay,
      available_days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      weak_topics: weakTopics,
      status: "active",
    })
    .select("id")
    .single();

  if (planError || !plan) {
    return { ok: false, error: planError?.message || "Failed to create the study plan.", status: 500 };
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
    return { ok: false, error: "Failed to create the study plan's tasks.", status: 500 };
  }

  const nextBestAction = generatedTasks[0];

  return {
    ok: true,
    planId: plan.id,
    alreadyExisted: false,
    nextBestAction: { title: nextBestAction.title, description: nextBestAction.description },
  };
}
