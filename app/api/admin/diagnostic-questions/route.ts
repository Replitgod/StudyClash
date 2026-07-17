import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServiceSupabaseClient, requireAdminUser } from "@/lib/server/apiUtils";
import { TERRA_TASK } from "@/lib/server/aiModels";
import { hasUnbalancedMathDelimiters } from "@/lib/server/mathValidation";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type QuestionType = "multiple_choice" | "student_produced_response";
type Difficulty = "easy" | "medium" | "hard";

type AnswerChoice = { id: string; text: string };

type CreateQuestionPayload = {
  examId?: string;
  section?: string;
  domain?: string;
  skill?: string;
  difficulty?: Difficulty;
  questionType?: QuestionType;
  stimulus?: string | null;
  questionText?: string;
  answerChoices?: AnswerChoice[] | null;
  correctAnswer?: string;
  explanation?: string;
  sourceType?: "ai_generated" | "human_authored";
  originalityConfirmed?: boolean;
  aiAssist?: {
    topicHint?: string;
  };
};

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "in_review";
  const examId = searchParams.get("examId");
  const section = searchParams.get("section");

  const supabase = getServiceSupabaseClient();
  let query = supabase
    .from("diagnostic_questions")
    .select(
      "id, exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at, created_at"
    )
    .order("created_at", { ascending: true })
    .limit(100);

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (examId) query = query.eq("exam_id", examId);
  if (section) query = query.eq("section", section);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load questions." }, { status: 500 });
  }

  return NextResponse.json({ questions: data || [] });
}

function validateAnswerShape(payload: CreateQuestionPayload): string | null {
  if (!payload.questionText || payload.questionText.trim().length < 5) {
    return "Question text is required.";
  }
  if (hasUnbalancedMathDelimiters(payload.questionText)) {
    return "Question text has an unclosed math delimiter ($ or $$).";
  }
  if (!payload.explanation || payload.explanation.trim().length < 5) {
    return "An explanation is required.";
  }
  if (hasUnbalancedMathDelimiters(payload.explanation)) {
    return "Explanation has an unclosed math delimiter ($ or $$).";
  }
  if (!payload.domain || !payload.skill) {
    return "Domain and skill must both be assigned.";
  }
  if (!payload.difficulty || !["easy", "medium", "hard"].includes(payload.difficulty)) {
    return "A valid difficulty (easy/medium/hard) is required.";
  }
  if (!payload.correctAnswer || payload.correctAnswer.trim().length === 0) {
    return "A correct answer is required.";
  }

  if (payload.questionType === "multiple_choice") {
    const choices = payload.answerChoices;
    if (!Array.isArray(choices) || choices.length < 2) {
      return "Multiple-choice questions need at least 2 answer choices.";
    }
    const ids = choices.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      return "Answer choice ids must be unique.";
    }
    const normalizedTexts = choices.map((c) => (c.text || "").trim().toLowerCase());
    if (new Set(normalizedTexts).size !== normalizedTexts.length) {
      return "Answer choices must not repeat the same text under different ids.";
    }
    if (!ids.includes(payload.correctAnswer)) {
      return "correctAnswer must match one answer choice id -- exactly one unambiguous correct answer.";
    }
    for (const choice of choices) {
      if (hasUnbalancedMathDelimiters(choice.text || "")) {
        return `Answer choice "${choice.id}" has an unclosed math delimiter ($ or $$).`;
      }
    }
  } else if (payload.questionType === "student_produced_response") {
    if (payload.answerChoices) {
      return "Student-produced-response questions must not have answer choices.";
    }
  } else {
    return "questionType must be multiple_choice or student_produced_response.";
  }

  return null;
}

// Cheap word-overlap check against recently authored questions in the same
// exam/section -- catches near-duplicate paraphrases the DB's exact-text
// unique index can't. Not a substitute for a human reviewer's judgment
// (nothing here can verify "not copied from an official test" -- that's why
// originalityConfirmed is a required, human-attested field), just a first
// pass that flags obvious rewrites before they reach the review queue.
function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const NEAR_DUPLICATE_THRESHOLD = 0.75;

async function draftWithAi(
  examName: string,
  section: string,
  domain: string,
  skill: string,
  difficulty: Difficulty,
  questionType: QuestionType,
  topicHint?: string
): Promise<CreateQuestionPayload | { error: string }> {
  const prompt = `Write ONE original, standardized-test-style practice question for the ${examName}, section "${section}", domain "${domain}", skill "${skill}", difficulty "${difficulty}".

Hard requirements:
- The question must be 100% original -- never reproduce, closely paraphrase, or reference any real official test question, passage, or answer key.
- If a "stimulus" (short passage) would normally accompany this skill, write an original one -- never quote or adapt real published text.
- questionType is "${questionType}".${questionType === "multiple_choice" ? " Provide exactly 4 answer choices with ids A/B/C/D, exactly one of which is unambiguously correct." : " This is a student-produced-response (grid-in) question -- provide no answer choices, just the correct numeric/algebraic answer as a string."}
- Provide a clear explanation of why the correct answer is right.
${topicHint ? `- Focus specifically on: ${topicHint}` : ""}

Return strict JSON: {"stimulus": string|null, "questionText": string, "answerChoices": [{"id":"A","text":"..."}]|null, "correctAnswer": string, "explanation": string}`;

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: TERRA_TASK.reasoning_effort,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
  });

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) return { error: "OpenAI did not return a draft." };

  try {
    const parsed = JSON.parse(rawContent);
    return {
      stimulus: parsed.stimulus ?? null,
      questionText: parsed.questionText,
      answerChoices: parsed.answerChoices ?? null,
      correctAnswer: parsed.correctAnswer,
      explanation: parsed.explanation,
    };
  } catch {
    return { error: "Failed to parse AI draft as JSON." };
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin.errorStatus) {
    return NextResponse.json({ error: admin.errorMessage }, { status: admin.errorStatus });
  }

  const body = (await request.json().catch(() => ({}))) as CreateQuestionPayload;

  if (!body.examId || !body.section || !body.domain || !body.skill || !body.difficulty || !body.questionType) {
    return NextResponse.json(
      { error: "examId, section, domain, skill, difficulty, and questionType are required." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClient();

  let draft: CreateQuestionPayload = body;

  // AI-assisted drafting: the AI only ever produces a 'draft'-status row --
  // it can never publish itself. A human reviewer must still confirm
  // originality and publish, same as a hand-authored question.
  if (body.aiAssist) {
    const { data: exam } = await supabase
      .from("exam_definitions")
      .select("name")
      .eq("id", body.examId)
      .single();

    const aiDraft = await draftWithAi(
      exam?.name || "this exam",
      body.section,
      body.domain,
      body.skill,
      body.difficulty,
      body.questionType,
      body.aiAssist.topicHint
    );

    if ("error" in aiDraft) {
      return NextResponse.json({ error: aiDraft.error }, { status: 502 });
    }

    draft = { ...body, ...aiDraft, sourceType: "ai_generated" };
  }

  const validationError = validateAnswerShape(draft);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (!body.aiAssist && !draft.originalityConfirmed) {
    return NextResponse.json(
      { error: "Please confirm this question is original and not copied from an official test before saving." },
      { status: 400 }
    );
  }

  const { data: recentInSection } = await supabase
    .from("diagnostic_questions")
    .select("question_text")
    .eq("exam_id", body.examId)
    .eq("section", body.section)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(200);

  const nearDuplicate = (recentInSection || []).find(
    (row: { question_text: string }) =>
      jaccardSimilarity(row.question_text, draft.questionText || "") >= NEAR_DUPLICATE_THRESHOLD
  );

  if (nearDuplicate) {
    return NextResponse.json(
      { error: "This question looks like a near-duplicate of an existing bank question. Please revise it or reject the duplicate." },
      { status: 409 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("diagnostic_questions")
    .insert({
      exam_id: body.examId,
      section: body.section,
      domain: body.domain,
      skill: body.skill,
      difficulty: draft.difficulty,
      question_type: draft.questionType,
      stimulus: draft.stimulus || null,
      question_text: draft.questionText,
      answer_choices: draft.answerChoices || null,
      correct_answer: draft.correctAnswer,
      explanation: draft.explanation,
      status: "draft",
      source_type: draft.sourceType || (body.aiAssist ? "ai_generated" : "human_authored"),
    })
    .select(
      "id, exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at, created_at"
    )
    .single();

  if (insertError || !inserted) {
    if (insertError) console.error("Failed to save diagnostic question:", insertError.message);
    return NextResponse.json({ error: "Failed to save the question." }, { status: 500 });
  }

  return NextResponse.json({ question: inserted });
}
