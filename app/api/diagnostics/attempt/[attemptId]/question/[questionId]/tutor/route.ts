import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { TERRA_TASK } from "@/lib/server/aiModels";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// The 6 exact actions the spec calls for on every missed question.
const VALID_ACTIONS = ["explain", "teach", "easier", "harder", "similar", "source"] as const;
type TutorAction = (typeof VALID_ACTIONS)[number];

type GeneratedQuestion = {
  questionText: string;
  answerChoices: { id: string; text: string }[] | null;
  correctAnswer: string;
  explanation: string;
};

async function callTutor<T>(prompt: string, fallbackMessage: string): Promise<T> {
  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: TERRA_TASK.reasoning_effort,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error(fallbackMessage);
  return JSON.parse(raw) as T;
}

// AI tutor integration for missed diagnostic questions (spec: "explain
// this" / "teach me this concept" / "easier example" / "harder question" /
// "5 similar questions" / "show where this was covered"). Deliberately its
// own lightweight route rather than reusing app/api/vyra-chat -- VYRA's
// contract is a general chat thread, not a diagnostic-question-scoped
// structured action, and threading a new context type through an
// already-heavily-used route is a bigger risk than one small new endpoint.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string; questionId: string }> }
) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const { attemptId, questionId } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (!VALID_ACTIONS.includes(body.action as TutorAction)) {
    return NextResponse.json({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }
  const action = body.action as TutorAction;

  const supabase = getServiceSupabaseClient();

  const { data: attempt } = await supabase
    .from("diagnostic_attempts")
    .select("id, user_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== userId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  const { data: response } = await supabase
    .from("diagnostic_responses")
    .select("selected_answer, is_correct")
    .eq("attempt_id", attemptId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (!response) {
    return NextResponse.json({ error: "This question is not part of your attempt." }, { status: 404 });
  }

  const { data: question } = await supabase
    .from("diagnostic_questions")
    .select(
      "question_text, stimulus, question_type, answer_choices, correct_answer, explanation, domain, skill, difficulty, concept_label, curriculum_standard, source_reference"
    )
    .eq("id", questionId)
    .maybeSingle();
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  // Purely a DB lookup, never fabricated -- "show where this was covered"
  // must never invent a page/chapter reference that doesn't actually exist
  // in the bank's metadata.
  if (action === "source") {
    const hasSource = !!(question.curriculum_standard || question.source_reference || question.concept_label);
    return NextResponse.json({
      action,
      domain: question.domain,
      skill: question.skill,
      conceptLabel: question.concept_label,
      curriculumStandard: question.curriculum_standard,
      sourceReference: question.source_reference,
      message: hasSource
        ? null
        : `This question isn't tagged with a specific curriculum source yet -- it tests "${question.skill}" under ${question.domain}.`,
    });
  }

  const context = `
Question: ${question.question_text}
${question.stimulus ? `Stimulus: ${question.stimulus}` : ""}
Type: ${question.question_type}
${question.answer_choices ? `Choices: ${JSON.stringify(question.answer_choices)}` : ""}
Correct answer: ${question.correct_answer}
Student's answer: ${response.selected_answer ?? "(not answered)"}
Existing explanation: ${question.explanation}
Skill: ${question.skill} (${question.domain}), difficulty: ${question.difficulty}
`.trim();

  try {
    if (action === "explain") {
      const result = await callTutor<{ explanation: string }>(
        `You are a patient tutor. A student missed this question. Re-explain it step by step, more clearly than the existing explanation, in a way a struggling student can follow. Ground everything in the question data below, never invent outside facts.\n\n${context}\n\nReturn ONLY valid JSON: {"explanation": string}`,
        "Empty tutor response."
      );
      return NextResponse.json({ action, explanation: result.explanation || question.explanation });
    }

    if (action === "teach") {
      const result = await callTutor<{ lesson: string }>(
        `You are a tutor. Teach the underlying concept behind this missed question as a short, clear mini-lesson (not just re-explaining the one question) -- the general skill/rule a student needs to answer questions like this correctly.\n\n${context}\n\nReturn ONLY valid JSON: {"lesson": string}`,
        "Empty tutor response."
      );
      return NextResponse.json({ action, lesson: result.lesson });
    }

    if (action === "easier" || action === "harder") {
      const result = await callTutor<{ question: GeneratedQuestion }>(
        `You are writing one ${action === "easier" ? "EASIER" : "HARDER"} practice question testing the exact same skill ("${question.skill}") as the question below, grounded in the same topic -- never invent unrelated content.\n\n${context}\n\nReturn ONLY valid JSON: {"question": {"questionText": string, "answerChoices": [{"id": string, "text": string}]|null, "correctAnswer": string, "explanation": string}}`,
        "Empty tutor response."
      );
      return NextResponse.json({ action, question: result.question });
    }

    // similar
    const result = await callTutor<{ questions: GeneratedQuestion[] }>(
      `You are writing exactly 5 practice questions testing the same skill ("${question.skill}") and similar difficulty as the question below -- vary the specifics, never invent unrelated content.\n\n${context}\n\nReturn ONLY valid JSON: {"questions": [{"questionText": string, "answerChoices": [{"id": string, "text": string}]|null, "correctAnswer": string, "explanation": string}, ...5 total]}`,
      "Empty tutor response."
    );
    return NextResponse.json({ action, questions: (result.questions || []).slice(0, 5) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Tutor request failed: ${err.message}` : "Tutor request failed." },
      { status: 502 }
    );
  }
}
