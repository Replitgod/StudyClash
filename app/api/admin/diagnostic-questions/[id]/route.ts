import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { hasUnbalancedMathDelimiters } from "@/lib/server/mathValidation";

export const runtime = "nodejs";

type QuestionStatus = "draft" | "in_review" | "published" | "rejected" | "archived";

const ALLOWED_STATUSES: QuestionStatus[] = ["draft", "in_review", "published", "rejected", "archived"];

type PatchPayload = {
  status?: QuestionStatus;
  domain?: string;
  skill?: string;
  difficulty?: "easy" | "medium" | "hard";
  questionText?: string;
  stimulus?: string | null;
  answerChoices?: unknown;
  correctAnswer?: string;
  explanation?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as PatchPayload;

  const supabase = getServiceSupabaseClient();
  const { data: existing, error: fetchError } = await supabase
    .from("diagnostic_questions")
    .select("id, status, question_text, explanation, answer_choices, correct_answer, question_type")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  // PATCH previously accepted these fields with zero validation -- an admin
  // could save an empty explanation or a broken math delimiter through the
  // edit form even though the create-time POST route validates them
  // strictly. This doesn't attempt POST's full cross-field validation
  // (e.g. correctAnswer matching a choice id), only the checks that make
  // sense against a single field in isolation.
  if (body.questionText !== undefined) {
    if (!body.questionText || body.questionText.trim().length < 5) {
      return NextResponse.json({ error: "Question text is required." }, { status: 400 });
    }
    if (hasUnbalancedMathDelimiters(body.questionText)) {
      return NextResponse.json(
        { error: "Question text has an unclosed math delimiter ($ or $$)." },
        { status: 400 }
      );
    }
  }

  if (body.explanation !== undefined) {
    if (!body.explanation || body.explanation.trim().length < 5) {
      return NextResponse.json({ error: "An explanation is required." }, { status: 400 });
    }
    if (hasUnbalancedMathDelimiters(body.explanation)) {
      return NextResponse.json(
        { error: "Explanation has an unclosed math delimiter ($ or $$)." },
        { status: 400 }
      );
    }
  }

  if (body.answerChoices !== undefined && Array.isArray(body.answerChoices)) {
    const choices = body.answerChoices as Array<{ id?: string; text?: string }>;
    const ids = choices.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "Answer choice ids must be unique." }, { status: 400 });
    }
    const normalizedTexts = choices.map((c) => (c.text || "").trim().toLowerCase());
    if (new Set(normalizedTexts).size !== normalizedTexts.length) {
      return NextResponse.json(
        { error: "Answer choices must not repeat the same text under different ids." },
        { status: 400 }
      );
    }
    for (const choice of choices) {
      if (hasUnbalancedMathDelimiters(choice.text || "")) {
        return NextResponse.json(
          { error: `Answer choice "${choice.id}" has an unclosed math delimiter ($ or $$).` },
          { status: 400 }
        );
      }
    }
  }

  const updates: Record<string, unknown> = {};

  if (body.domain !== undefined) updates.domain = body.domain;
  if (body.skill !== undefined) updates.skill = body.skill;
  if (body.difficulty !== undefined) updates.difficulty = body.difficulty;
  if (body.questionText !== undefined) updates.question_text = body.questionText;
  if (body.stimulus !== undefined) updates.stimulus = body.stimulus;
  if (body.answerChoices !== undefined) updates.answer_choices = body.answerChoices;
  if (body.correctAnswer !== undefined) updates.correct_answer = body.correctAnswer;
  if (body.explanation !== undefined) updates.explanation = body.explanation;

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    // Publishing is the one transition that re-validates the answer key --
    // "only published questions can appear in a diagnostic" only means
    // something if publish itself is gated, not just creation.
    if (body.status === "published") {
      const finalText = (updates.question_text as string) ?? existing.question_text;
      const finalExplanation = (updates.explanation as string) ?? existing.explanation;
      const finalCorrectAnswer = (updates.correct_answer as string) ?? existing.correct_answer;
      const finalChoices = (updates.answer_choices ?? existing.answer_choices) as
        | { id: string }[]
        | null;

      if (!finalText || finalText.trim().length < 5) {
        return NextResponse.json({ error: "Cannot publish: question text is missing." }, { status: 400 });
      }
      if (!finalExplanation || finalExplanation.trim().length < 5) {
        return NextResponse.json({ error: "Cannot publish: explanation is missing." }, { status: 400 });
      }
      if (existing.question_type === "multiple_choice") {
        const ids = (finalChoices || []).map((c) => c.id);
        if (ids.length < 2 || !ids.includes(finalCorrectAnswer)) {
          return NextResponse.json(
            { error: "Cannot publish: answer choices must include exactly one matching correct answer." },
            { status: 400 }
          );
        }
      }

      updates.reviewed_by = admin.userId;
      updates.reviewed_at = new Date().toISOString();
    }

    if (body.status === "rejected" || body.status === "archived") {
      updates.reviewed_by = admin.userId;
      updates.reviewed_at = new Date().toISOString();
    }

    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes provided." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("diagnostic_questions")
    .update(updates)
    .eq("id", id)
    .select(
      "id, exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at, created_at"
    )
    .single();

  if (updateError || !updated) {
    if (updateError) console.error("Failed to update diagnostic question:", updateError.message);
    return NextResponse.json(
      { error: "Failed to update the question." },
      { status: 500 }
    );
  }

  return NextResponse.json({ question: updated });
}
