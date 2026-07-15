import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { loadAssignedModuleQuestions } from "@/lib/server/diagnosticBank";

export const runtime = "nodejs";

type ExamModuleConfig = { module: number; questions: number; minutes: number };
type ExamSectionConfig = { key: string; label: string; modules: ExamModuleConfig[] };
type ExamConfiguration = { sections: ExamSectionConfig[]; breakMinutesBetweenSections: number };

// Loads current state for the attempt-taking page on every mount --
// whether that's a brand-new module just handed off from /start, a page
// refresh mid-module, or navigating back in from the dashboard days later.
// This is the one source of truth the client polls on load; submit-module
// and resume-after-break drive state changes from there.
export async function GET(
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
    .select("id, user_id, exam_id, mode, status, current_section, current_module, updated_at")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt || attempt.user_id !== userId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  if (attempt.status === "completed") {
    return NextResponse.json({ status: "completed", attemptId });
  }

  const { data: exam } = await supabase
    .from("exam_definitions")
    .select("configuration")
    .eq("id", attempt.exam_id)
    .single();

  const config = exam?.configuration as ExamConfiguration | undefined;

  if (attempt.status === "module_break") {
    return NextResponse.json({
      status: "module_break",
      section: attempt.current_section,
      breakMinutes: config?.breakMinutesBetweenSections || 10,
    });
  }

  const sectionConfig = config?.sections.find((s) => s.key === attempt.current_section);
  const moduleConfig = sectionConfig?.modules.find((m) => m.module === attempt.current_module);
  const timeLimitMinutes =
    attempt.mode === "quick"
      ? // Quick mode module minutes aren't in exam config (that config only
        // describes the real Full Diagnostic structure) -- fall back to a
        // sane default; the client already got the authoritative value from
        // /start or /submit-module when this module began.
        18
      : moduleConfig?.minutes || 32;

  const items = await loadAssignedModuleQuestions(
    supabase,
    attemptId,
    attempt.current_section,
    attempt.current_module
  );

  return NextResponse.json({
    status: "in_progress",
    section: attempt.current_section,
    module: attempt.current_module,
    timeLimitMinutes,
    moduleStartedAt: attempt.updated_at,
    items,
  });
}
