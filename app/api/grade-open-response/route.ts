import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getClientIpAddress,
  getServiceSupabaseClient,
  hashIdentifier,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

// Grades a free-text answer to an open_response question against the
// question's rubric_points -- the async counterpart to the instant
// choice === correct_answer check multiple_choice/true_false questions use.
// Battle is open to guests (see app/api/battle/finish), so this route
// mirrors that: no login required, just an IP rate limit against abuse.
const MAX_ANSWER_CHARACTERS = 4000;
const CORRECT_THRESHOLD = 70;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type GradeResult = {
  score: number;
  pointsAddressed: string[];
  pointsMissed: string[];
  feedback: string;
};

function isValidGradeResult(value: unknown): value is GradeResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    Array.isArray(candidate.pointsAddressed) &&
    Array.isArray(candidate.pointsMissed) &&
    typeof candidate.feedback === "string"
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Grading is not configured right now." },
        { status: 503 }
      );
    }

    const ip = getClientIpAddress(req);
    const ipHash = hashIdentifier(ip);
    const rateLimit = await checkDistributedRateLimit({
      key: `grade-open-response:${ipHash}`,
      limit: 30,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many grading requests. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const body = await req.json();
    const questionId = typeof body.questionId === "string" ? body.questionId : "";
    const studentAnswer =
      typeof body.studentAnswer === "string" ? body.studentAnswer.trim() : "";

    if (!questionId) {
      return NextResponse.json({ error: "Missing questionId." }, { status: 400 });
    }

    if (!studentAnswer) {
      return NextResponse.json({ error: "Answer cannot be empty." }, { status: 400 });
    }

    const truncatedAnswer = studentAnswer.slice(0, MAX_ANSWER_CHARACTERS);

    const supabase = getServiceSupabaseClient();
    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select("question_text, rubric_points, explanation, question_type, reasoning_format")
      .eq("id", questionId)
      .single();

    if (questionError || !question) {
      return NextResponse.json({ error: "Question not found." }, { status: 404 });
    }

    if (question.question_type !== "open_response") {
      return NextResponse.json(
        { error: "This question is not an open-response question." },
        { status: 400 }
      );
    }

    const rubricPoints: string[] = Array.isArray(question.rubric_points)
      ? question.rubric_points.filter((p: unknown) => typeof p === "string")
      : [];

    const isStepByStep = question.reasoning_format === "step_by_step";

    const prompt = `You are grading a student's ${
      isStepByStep ? "step-by-step solution" : "argumentation response"
    } to a study question. Be fair but rigorous -- partial credit is fine, but don't reward answers that merely restate the question or add filler with no substance.

QUESTION:
${question.question_text}

RUBRIC POINTS (what a strong answer should include)${isStepByStep ? ", in order" : ""}:
${rubricPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

MODEL ANSWER (for your reference only -- the student never saw this):
${question.explanation}

STUDENT'S ANSWER:
${truncatedAnswer}

Grade the student's answer:
- "score": an integer 0-100 reflecting how well it addresses the rubric points${isStepByStep ? " and reaches a correct result through valid reasoning" : " with real evidence-backed reasoning"}.
- "pointsAddressed": which rubric points (quote them) the answer actually covers.
- "pointsMissed": which rubric points (quote them) the answer is missing or gets wrong.
- "feedback": 2-3 sentences of specific, constructive feedback directly to the student.

Return ONLY valid JSON, no markdown:
{"score": 0, "pointsAddressed": [], "pointsMissed": [], "feedback": "..."}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 800,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json({ error: "Grading failed -- no response." }, { status: 500 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return NextResponse.json({ error: "Grading failed -- invalid response." }, { status: 500 });
    }

    if (!isValidGradeResult(parsed)) {
      return NextResponse.json({ error: "Grading failed -- malformed response." }, { status: 500 });
    }

    const score = Math.max(0, Math.min(100, Math.round(parsed.score)));

    return NextResponse.json({
      score,
      isCorrect: score >= CORRECT_THRESHOLD,
      pointsAddressed: parsed.pointsAddressed.filter((p): p is string => typeof p === "string"),
      pointsMissed: parsed.pointsMissed.filter((p): p is string => typeof p === "string"),
      feedback: parsed.feedback,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to grade this answer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
