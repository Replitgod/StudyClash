import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";

export const runtime = "nodejs";

// Only reachable once an attempt is completed -- diagnostic_questions has
// no client-readable RLS policy at all (see the migration), so the results
// page can't join correct_answer/explanation itself. This route is the one
// place that reveals them, and only after the attempt is closed out.
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
    .select("id, user_id, exam_id, mode, status, adaptive_path, started_at, completed_at, estimated_score_low, estimated_score_high, exam:exam_definitions(name, slug, disclaimer)")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt || attempt.user_id !== userId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  if (attempt.status !== "completed") {
    return NextResponse.json({ error: "This diagnostic is not finished yet." }, { status: 409 });
  }

  const { data: results } = await supabase
    .from("diagnostic_results")
    .select(
      "overall_accuracy, section_results, domain_results, skill_results, pacing_results, strongest_skills, weakest_skills, estimated_score_low, estimated_score_high"
    )
    .eq("attempt_id", attemptId)
    .single();

  const { data: responseRows, error: responsesError } = await supabase
    .from("diagnostic_responses")
    .select(
      "question_id, selected_answer, is_correct, response_time_seconds, flagged, section, module, question:diagnostic_questions(domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)"
    )
    .eq("attempt_id", attemptId)
    .order("section", { ascending: true })
    .order("module", { ascending: true });

  if (responsesError) {
    return NextResponse.json({ error: "Failed to load your answer review." }, { status: 500 });
  }

  return NextResponse.json({
    attempt,
    results,
    responses: responseRows || [],
  });
}
