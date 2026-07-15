import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";

export const runtime = "nodejs";

// Autosave endpoint, called after every answer change / flag toggle.
// is_correct is computed here, server-side, from the bank's correct_answer
// -- it is NEVER sent back in the response, because "do not reveal
// correctness during the diagnostic" is a hard product requirement.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    questionId?: string;
    selectedAnswer?: string | null;
    responseTimeSeconds?: number;
    flagged?: boolean;
  };

  if (!body.questionId) {
    return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .select("id, user_id, status")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt || attempt.user_id !== userId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  if (attempt.status !== "in_progress" && attempt.status !== "module_break") {
    return NextResponse.json({ error: "This attempt is no longer accepting answers." }, { status: 409 });
  }

  const { data: existingResponse, error: existingError } = await supabase
    .from("diagnostic_responses")
    .select("id, question_id")
    .eq("attempt_id", attemptId)
    .eq("question_id", body.questionId)
    .maybeSingle();

  if (existingError || !existingResponse) {
    return NextResponse.json(
      { error: "This question was not assigned to your current module." },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};

  if (body.flagged !== undefined) {
    updates.flagged = !!body.flagged;
  }

  if (body.selectedAnswer !== undefined) {
    const { data: question } = await supabase
      .from("diagnostic_questions")
      .select("correct_answer")
      .eq("id", body.questionId)
      .single();

    updates.selected_answer = body.selectedAnswer;
    updates.is_correct = question ? question.correct_answer === body.selectedAnswer : null;
  }

  if (typeof body.responseTimeSeconds === "number" && Number.isFinite(body.responseTimeSeconds)) {
    updates.response_time_seconds = Math.max(0, Math.round(body.responseTimeSeconds));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await supabase
    .from("diagnostic_responses")
    .update(updates)
    .eq("id", existingResponse.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to save your answer." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
