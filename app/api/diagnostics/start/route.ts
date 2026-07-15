import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import {
  assignModuleQuestions,
  fetchPublishedPool,
  loadAssignedModuleQuestions,
  pickModule1Questions,
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

const FIRST_SECTION = "reading_writing";

export async function POST(request: NextRequest) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    examSlug?: string;
    mode?: "quick" | "full";
  };

  if (!body.examSlug || (body.mode !== "quick" && body.mode !== "full")) {
    return NextResponse.json({ error: "examSlug and a valid mode (quick/full) are required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: exam, error: examError } = await supabase
    .from("exam_definitions")
    .select("id, slug, name, status, disclaimer, configuration")
    .eq("slug", body.examSlug)
    .single();

  if (examError || !exam) {
    return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  }

  if (exam.status !== "available") {
    return NextResponse.json({ error: `${exam.name} is not available yet.` }, { status: 400 });
  }

  // Resume an existing in-progress attempt instead of starting a duplicate
  // one -- the DB's partial unique index on (user_id, exam_id, mode) where
  // status='in_progress' backs this up, but checking first avoids ever
  // hitting that constraint from the happy path.
  const { data: existingAttempt } = await supabase
    .from("diagnostic_attempts")
    .select("id, status, current_section, current_module, adaptive_path, mode, updated_at")
    .eq("user_id", userId)
    .eq("exam_id", exam.id)
    .eq("mode", body.mode)
    .eq("status", "in_progress")
    .maybeSingle();

  const config = exam.configuration as ExamConfiguration;

  if (existingAttempt) {
    const items = await loadAssignedModuleQuestions(
      supabase,
      existingAttempt.id,
      existingAttempt.current_section,
      existingAttempt.current_module
    );

    const resumeSectionConfig = config.sections?.find((s) => s.key === existingAttempt.current_section);
    const resumeModuleConfig = resumeSectionConfig?.modules.find(
      (m) => m.module === existingAttempt.current_module
    );
    const resumeTimeLimitMinutes =
      existingAttempt.mode === "quick"
        ? QUICK_MODE_TIME_LIMIT_MINUTES[existingAttempt.current_section]
        : resumeModuleConfig?.minutes || 30;

    return NextResponse.json({
      attemptId: existingAttempt.id,
      resumed: true,
      section: existingAttempt.current_section,
      module: existingAttempt.current_module,
      timeLimitMinutes: resumeTimeLimitMinutes,
      // Approximates "time already spent in this module" from when the
      // attempt row was last updated (set exactly when this module was
      // assigned) -- resuming after a disconnect picks up with whatever
      // time is left rather than granting a fresh full timer.
      moduleStartedAt: existingAttempt.updated_at,
      disclaimer: exam.disclaimer,
      items,
    });
  }

  const sectionConfig = config.sections?.find((s) => s.key === FIRST_SECTION);
  const module1Config = sectionConfig?.modules.find((m) => m.module === 1);

  const questionCount =
    body.mode === "quick"
      ? QUICK_MODE_QUESTION_COUNTS[FIRST_SECTION]
      : module1Config?.questions || 27;
  const timeLimitMinutes =
    body.mode === "quick"
      ? QUICK_MODE_TIME_LIMIT_MINUTES[FIRST_SECTION]
      : module1Config?.minutes || 32;

  const pool = await fetchPublishedPool(supabase, exam.id, FIRST_SECTION);
  if (pool.length === 0) {
    return NextResponse.json(
      { error: `No published ${sectionConfig?.label || FIRST_SECTION} questions are available yet. Please check back soon.` },
      { status: 503 }
    );
  }

  const selected = pickModule1Questions(pool, questionCount);

  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .insert({
      user_id: userId,
      exam_id: exam.id,
      mode: body.mode,
      status: "in_progress",
      current_section: FIRST_SECTION,
      current_module: 1,
      adaptive_path: {},
    })
    .select("id")
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json(
      { error: attemptError?.message || "Failed to start the diagnostic." },
      { status: 500 }
    );
  }

  await assignModuleQuestions(supabase, attempt.id, FIRST_SECTION, 1, selected);
  const moduleStartedAt = new Date().toISOString();
  const items = await loadAssignedModuleQuestions(supabase, attempt.id, FIRST_SECTION, 1);

  return NextResponse.json({
    attemptId: attempt.id,
    resumed: false,
    section: FIRST_SECTION,
    module: 1,
    timeLimitMinutes,
    moduleStartedAt,
    disclaimer: exam.disclaimer,
    items,
  });
}
