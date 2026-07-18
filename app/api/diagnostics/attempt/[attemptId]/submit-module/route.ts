import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import {
  assignModuleQuestions,
  chooseModule2Path,
  fetchPublishedPool,
  finalizeAttempt,
  loadAssignedModuleQuestions,
  pickModule1Questions,
  pickModule2Questions,
  QUICK_MODE_QUESTION_COUNTS,
  QUICK_MODE_TIME_LIMIT_MINUTES,
} from "@/lib/server/diagnosticBank";

export const runtime = "nodejs";
export const maxDuration = 30;

type ExamModuleConfig = { module: number; questions: number; minutes: number };
type ExamSectionConfig = { key: string; label: string; modules: ExamModuleConfig[] };
type ExamConfiguration = {
  sections: ExamSectionConfig[];
  breakMinutesBetweenSections: number;
  adaptive: { module2ThresholdAccuracy: number };
};

const SECTION_ORDER = ["reading_writing", "math"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await params;
  const supabase = getServiceSupabaseClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .select("id, user_id, exam_id, mode, status, current_section, current_module, adaptive_path")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt || attempt.user_id !== userId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "This module has already been submitted." }, { status: 409 });
  }

  // Weak-area attempts are always exactly one flat module -- submitting it
  // finishes the whole attempt directly, no section transition, no
  // adaptive Module 2 routing, no exam-config lookup needed.
  if (attempt.mode === "weak_area") {
    const results = await finalizeAttempt(supabase, attemptId);
    return NextResponse.json({ status: "completed", attemptId, results });
  }

  const { data: exam, error: examError } = await supabase
    .from("exam_definitions")
    .select("id, configuration")
    .eq("id", attempt.exam_id)
    .single();

  if (examError || !exam) {
    return NextResponse.json({ error: "Exam configuration not found." }, { status: 500 });
  }

  const config = exam.configuration as ExamConfiguration;
  const section = attempt.current_section as string;
  const moduleNumber = attempt.current_module as number;
  const mode = attempt.mode as "quick" | "full";

  const { data: finishedResponses, error: responsesError } = await supabase
    .from("diagnostic_responses")
    .select("is_correct")
    .eq("attempt_id", attemptId)
    .eq("section", section)
    .eq("module", moduleNumber);

  if (responsesError) {
    return NextResponse.json({ error: "Failed to score this module." }, { status: 500 });
  }

  const total = finishedResponses?.length || 0;
  const correct = (finishedResponses || []).filter((r) => r.is_correct).length;
  const accuracy = total > 0 ? correct / total : 0;

  // Full mode, Module 1 just finished within a section -> route into an
  // adaptive Module 2 using the transparent configured threshold, not a
  // second full section transition.
  if (mode === "full" && moduleNumber === 1) {
    const sectionConfig = config.sections.find((s) => s.key === section);
    const module2Config = sectionConfig?.modules.find((m) => m.module === 2);
    const path = chooseModule2Path(accuracy, config.adaptive.module2ThresholdAccuracy);

    const { data: module1Ids } = await supabase
      .from("diagnostic_responses")
      .select("question_id")
      .eq("attempt_id", attemptId)
      .eq("section", section)
      .eq("module", 1);

    const excludeIds = new Set((module1Ids || []).map((r) => r.question_id as string));
    const pool = await fetchPublishedPool(supabase, exam.id, section);
    const selected = pickModule2Questions(pool, module2Config?.questions || 22, path, excludeIds);

    await assignModuleQuestions(supabase, attemptId, section, 2, selected);

    const nextAdaptivePath = { ...(attempt.adaptive_path || {}), [section]: path };
    await supabase
      .from("diagnostic_attempts")
      .update({ current_module: 2, adaptive_path: nextAdaptivePath })
      .eq("id", attemptId);

    const items = await loadAssignedModuleQuestions(supabase, attemptId, section, 2);

    return NextResponse.json({
      status: "in_progress",
      section,
      module: 2,
      timeLimitMinutes: module2Config?.minutes || 32,
      moduleStartedAt: new Date().toISOString(),
      adaptivePath: path,
      items,
    });
  }

  // The section (both modules for full mode, its one module for quick
  // mode) is done. Move to the next section, or finish the whole attempt.
  const currentSectionIndex = SECTION_ORDER.indexOf(section);
  const nextSection = SECTION_ORDER[currentSectionIndex + 1];

  if (!nextSection) {
    const results = await finalizeAttempt(supabase, attemptId);
    return NextResponse.json({ status: "completed", attemptId, results });
  }

  const nextSectionConfig = config.sections.find((s) => s.key === nextSection);
  const nextModule1Config = nextSectionConfig?.modules.find((m) => m.module === 1);
  const nextQuestionCount =
    mode === "quick" ? QUICK_MODE_QUESTION_COUNTS[nextSection] : nextModule1Config?.questions || 22;
  const nextTimeLimitMinutes =
    mode === "quick" ? QUICK_MODE_TIME_LIMIT_MINUTES[nextSection] : nextModule1Config?.minutes || 35;

  const nextPool = await fetchPublishedPool(supabase, exam.id, nextSection);
  const nextSelected = pickModule1Questions(nextPool, nextQuestionCount);
  await assignModuleQuestions(supabase, attemptId, nextSection, 1, nextSelected);

  // Full mode gets the scheduled break; Quick Diagnostic (a shorter,
  // single-sitting estimate) moves straight into the next section.
  const nextStatus = mode === "full" ? "module_break" : "in_progress";

  await supabase
    .from("diagnostic_attempts")
    .update({ status: nextStatus, current_section: nextSection, current_module: 1 })
    .eq("id", attemptId);

  if (nextStatus === "module_break") {
    return NextResponse.json({
      status: "module_break",
      breakMinutes: config.breakMinutesBetweenSections,
      nextSection,
    });
  }

  const items = await loadAssignedModuleQuestions(supabase, attemptId, nextSection, 1);
  return NextResponse.json({
    status: "in_progress",
    section: nextSection,
    module: 1,
    timeLimitMinutes: nextTimeLimitMinutes,
    moduleStartedAt: new Date().toISOString(),
    items,
  });
}
