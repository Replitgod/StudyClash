import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { loadAssignedModuleQuestions } from "@/lib/server/diagnosticBank";

export const runtime = "nodejs";

type ExamModuleConfig = { module: number; questions: number; minutes: number };
type ExamSectionConfig = { key: string; label: string; modules: ExamModuleConfig[] };
type ExamConfiguration = { sections: ExamSectionConfig[] };

// The next section's Module 1 questions are already assigned by
// submit-module (so a student who closes the tab mid-break resumes to the
// same break screen, not a freshly re-rolled question set) -- this route
// just flips the attempt back to in_progress and hands those questions over.
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
    .select("id, user_id, exam_id, status, current_section, current_module")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt || attempt.user_id !== userId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  if (attempt.status !== "module_break") {
    return NextResponse.json({ error: "This attempt is not on a break." }, { status: 409 });
  }

  const { data: exam } = await supabase
    .from("exam_definitions")
    .select("configuration")
    .eq("id", attempt.exam_id)
    .single();

  const config = exam?.configuration as ExamConfiguration | undefined;
  const sectionConfig = config?.sections.find((s) => s.key === attempt.current_section);
  const moduleConfig = sectionConfig?.modules.find((m) => m.module === attempt.current_module);

  await supabase.from("diagnostic_attempts").update({ status: "in_progress" }).eq("id", attemptId);

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
    timeLimitMinutes: moduleConfig?.minutes || 35,
    moduleStartedAt: new Date().toISOString(),
    items,
  });
}
