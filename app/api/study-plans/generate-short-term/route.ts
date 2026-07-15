import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { generateShortTermPlanTasks } from "@/lib/studyPlanGenerator";
import { buildLiveResourceCatalog } from "@/lib/server/studyPlanResources";

export const runtime = "nodejs";
export const maxDuration = 30;

type AssessmentType =
  | "quiz"
  | "unit_test"
  | "midterm"
  | "final_exam"
  | "assignment"
  | "presentation"
  | "standardized_test";

type GenerateShortTermPayload = {
  matchId?: string;
  assessmentType?: AssessmentType;
  assessmentName?: string;
  dueDate?: string; // yyyy-mm-dd
  goal?: string;
  minutesPerDay?: number;
};

const ALLOWED_TYPES: AssessmentType[] = [
  "quiz",
  "unit_test",
  "midterm",
  "final_exam",
  "assignment",
  "presentation",
  "standardized_test",
];

export async function POST(request: NextRequest) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as GenerateShortTermPayload;

  if (!body.matchId || !body.dueDate || !body.assessmentType || !ALLOWED_TYPES.includes(body.assessmentType)) {
    return NextResponse.json(
      { error: "matchId, a valid assessmentType, and dueDate are required." },
      { status: 400 }
    );
  }

  const dueDate = new Date(`${body.dueDate}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "dueDate must be a valid date." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: existingPlan } = await supabase
    .from("study_plans")
    .select("id")
    .eq("match_id", body.matchId)
    .eq("status", "active")
    .maybeSingle();

  if (existingPlan) {
    return NextResponse.json({ planId: existingPlan.id, alreadyExisted: true });
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, user_id, deck_id, correct_answers, total_questions, deck:decks(title, course_name)")
    .eq("id", body.matchId)
    .single();

  if (matchError || !match || match.user_id !== userId) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const deckInfo = match.deck as unknown as { title: string; course_name: string | null };
  const deckTitle = deckInfo?.title || "your deck";

  // This match's own missed questions, weighted with this deck's broader
  // weak/improving/mastered history -- not just "what you got wrong once,"
  // per the spec's "previous performance on the same deck" requirement.
  const { data: answerRows } = await supabase
    .from("match_answers")
    .select("is_correct, question:questions(topic)")
    .eq("match_id", body.matchId);

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
    return NextResponse.json(
      { error: "No topic data was found for this deck yet -- battle again to build a weak-topic profile." },
      { status: 400 }
    );
  }

  const minutesPerDay = body.minutesPerDay && body.minutesPerDay > 0 ? body.minutesPerDay : 25;

  // Only the top couple of weak topics ever actually appear in a short-term
  // plan's tasks (see generateShortTermPlanTasks), so the live lookup is
  // naturally already bounded here -- no separate cap needed like the
  // long-term generator's MAX_LIVE_LOOKUPS.
  const resourceCatalog = await buildLiveResourceCatalog(
    weakTopics.slice(0, 3).map((t) => t.topic),
    supabase,
    deckInfo?.course_name || undefined
  );

  const generatedTasks = generateShortTermPlanTasks({
    today: new Date(),
    dueDate,
    weakTopics,
    deckId: match.deck_id,
    deckTitle,
    minutesPerDay,
    resourceCatalog,
  });

  if (generatedTasks.length === 0) {
    return NextResponse.json({ error: "Could not build a plan for this due date." }, { status: 400 });
  }

  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      source_type: "battle_assessment",
      match_id: body.matchId,
      title: body.assessmentName ? `${body.assessmentName} Prep` : `${deckTitle} Prep`,
      assessment_type: body.assessmentType,
      assessment_name: body.assessmentName || null,
      assessment_date: body.dueDate,
      target_score: body.goal || null,
      minutes_per_day: minutesPerDay,
      available_days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
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

  const nextBestAction = generatedTasks[0];

  return NextResponse.json({
    planId: plan.id,
    alreadyExisted: false,
    nextBestAction: {
      title: nextBestAction.title,
      description: nextBestAction.description,
    },
  });
}
