import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createHash } from "node:crypto";
import { TERRA_TASK, type ReasoningEffort } from "@/lib/server/aiModels";

// Reasoning-effort models spend part of max_completion_tokens on hidden
// reasoning before writing visible output. A flat token cap sized only for
// the visible JSON silently truncates to empty content once the model's
// hidden reasoning eats most of the budget -- see the same headroom table
// in app/api/generate-questions/route.ts for the original diagnosis.
const REASONING_TOKEN_HEADROOM: Record<ReasoningEffort, number> = {
  none: 200,
  low: 800,
  medium: 2000,
  high: 5000,
  xhigh: 10000,
};

// Public, unauthenticated route backing the "Try Demo" battle at
// /demo/battle. No Supabase writes here on purpose: the demo never creates
// a deck or persists anything, so there is nothing to clean up if this
// fails and the client falls back to its local question pool.
export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_QUESTION_COUNT = 6;
const MIN_QUESTION_COUNT = 4;
const MAX_QUESTION_COUNT = 8;
const MAX_AVOID_TOPICS = 24;

// Skews odd counts toward one extra "hard" question rather than "medium" --
// this route exists specifically because plain single-step questions read
// as too easy, so ties should lean harder, not easier.
function splitMediumHard(total: number): { mediumCount: number; hardCount: number } {
  const hardCount = Math.ceil(total / 2);
  return { mediumCount: total - hardCount, hardCount };
}

function clampQuestionCount(value: unknown): number {
  const n = typeof value === "number" ? Math.floor(value) : DEFAULT_QUESTION_COUNT;
  if (!Number.isFinite(n)) return DEFAULT_QUESTION_COUNT;
  return Math.max(MIN_QUESTION_COUNT, Math.min(MAX_QUESTION_COUNT, n));
}

const SUBJECT_MIX_PRESETS = {
  sat_math:
    "linear equations, systems of equations, quadratic equations, functions and function composition, exponents and exponential growth, ratios and proportions, percentages, absolute value, compound inequalities, right triangles, circles, statistics",
  general_academic:
    "algebra and functions, biology (cell structure, genetics), economics (supply and demand, market forces), reading comprehension and argument structure, chemistry fundamentals, U.S. history reasoning, statistics and data interpretation, geometry",
} as const;

type SubjectMix = keyof typeof SUBJECT_MIX_PRESETS;

function resolveSubjectMix(value: unknown): SubjectMix {
  return value === "general_academic" ? "general_academic" : "sat_math";
}

// Best-effort per-instance limiter. This is intentionally not backed by a
// database: the demo route has no user/session to attribute cost to, so a
// warm-instance-scoped cap is enough to blunt casual abuse without adding a
// public-writable table.
const DEMO_IP_WINDOW_MS = 60_000;
const DEMO_IP_LIMIT = 5;
const recentRequestsByIp = new Map<string, number[]>();

type DemoQuestion = {
  question_text: string;
  answer_choices: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: string;
};

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwarded.split(",").map((part) => part.trim()).filter(Boolean)[0];
  return firstForwarded || req.headers.get("x-real-ip") || "unknown";
}

function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function isRateLimited(ipHash: string): boolean {
  const now = Date.now();
  const windowStart = now - DEMO_IP_WINDOW_MS;
  const timestamps = (recentRequestsByIp.get(ipHash) || []).filter((t) => t > windowStart);

  if (timestamps.length >= DEMO_IP_LIMIT) {
    recentRequestsByIp.set(ipHash, timestamps);
    return true;
  }

  timestamps.push(now);
  recentRequestsByIp.set(ipHash, timestamps);
  return false;
}

function buildPrompt(args: {
  totalQuestions: number;
  mediumCount: number;
  hardCount: number;
  avoidQuestionTexts: string[];
  subjectMix: string;
}): string {
  const { totalQuestions, mediumCount, hardCount, avoidQuestionTexts, subjectMix } = args;
  const avoidBlock =
    avoidQuestionTexts.length > 0
      ? `\nDo not reuse or closely rephrase any of these questions from a previous run:\n${avoidQuestionTexts
          .slice(0, MAX_AVOID_TOPICS)
          .map((text) => `- ${text}`)
          .join("\n")}`
      : "";

  return `You are writing a short practice set for a product demo. The demo's whole point is to show that this app asks genuinely challenging, exam-realistic questions -- not simple one-step recall.

Create exactly ${totalQuestions} multiple-choice questions covering a MIX of different topics (choose from: ${subjectMix}). No two questions may share the same topic.

Difficulty requirements:
- Exactly ${mediumCount} questions with difficulty "medium": requires connecting two related facts or applying a rule to a new situation, not a single lookup step.
- Exactly ${hardCount} questions with difficulty "hard": requires multiple reasoning steps, synthesizing more than one concept, or a scenario that cannot be solved by a single formula substitution. At least 2 of the 4 answer choices for every hard question must be plausible near-misses that reflect a specific, believable misconception -- not random wrong values.
- Do NOT include any "easy" single-step questions.

Rules for every question:
- "question_text": a clear, self-contained SAT-style question. No references to notes or external material -- these are general SAT Math questions.
- "answer_choices": an array of EXACTLY 4 short answer strings. Wrong choices must be realistic distractors.
- "correct_answer": must be an EXACT character-for-character match to one of the 4 strings in "answer_choices".
- "explanation": 2-3 concise sentences showing the key step(s) and why the correct answer is right.
- "topic": a short label (2-4 words) for the specific skill this question tests.
- "difficulty": exactly "medium" or "hard".
${avoidBlock}

Return ONLY valid JSON, no markdown, no extra text, in this exact shape:
{
  "questions": [
    {
      "question_text": "...",
      "answer_choices": ["...", "...", "...", "..."],
      "correct_answer": "...",
      "explanation": "...",
      "topic": "...",
      "difficulty": "medium"
    }
  ]
}`;
}

function validateQuestions(
  questions: unknown,
  expected: { totalQuestions: number; mediumCount: number; hardCount: number }
): string | null {
  if (!Array.isArray(questions) || questions.length !== expected.totalQuestions) {
    return `Expected exactly ${expected.totalQuestions} questions.`;
  }

  let mediumCount = 0;
  let hardCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Partial<DemoQuestion>;
    const label = `Question ${i + 1}`;

    if (!q || typeof q !== "object") return `${label} is not a valid object.`;
    if (!q.question_text || typeof q.question_text !== "string" || !q.question_text.trim()) {
      return `${label} is missing question_text.`;
    }
    if (!Array.isArray(q.answer_choices) || q.answer_choices.length !== 4) {
      return `${label} must have exactly 4 answer_choices.`;
    }

    const cleanedChoices = q.answer_choices.map((c) => (typeof c === "string" ? c.trim() : ""));
    if (cleanedChoices.some((c) => !c)) return `${label} has an empty answer choice.`;
    if (new Set(cleanedChoices.map((c) => c.toLowerCase())).size !== 4) {
      return `${label} has duplicate answer choices.`;
    }
    if (!q.correct_answer || !cleanedChoices.includes(q.correct_answer.trim())) {
      return `${label} has a correct_answer that doesn't match its answer_choices.`;
    }
    if (!q.explanation || typeof q.explanation !== "string" || !q.explanation.trim()) {
      return `${label} is missing an explanation.`;
    }
    if (!q.topic || typeof q.topic !== "string" || !q.topic.trim()) {
      return `${label} is missing a topic.`;
    }

    const difficulty = typeof q.difficulty === "string" ? q.difficulty.toLowerCase().trim() : "";
    if (difficulty !== "medium" && difficulty !== "hard") {
      return `${label} must be "medium" or "hard", got "${difficulty}".`;
    }
    if (difficulty === "medium") mediumCount++;
    if (difficulty === "hard") hardCount++;
  }

  if (mediumCount !== expected.mediumCount || hardCount !== expected.hardCount) {
    return `Expected ${expected.mediumCount} medium and ${expected.hardCount} hard, got ${mediumCount} medium and ${hardCount} hard.`;
  }

  return null;
}

async function generateOnce(args: {
  totalQuestions: number;
  mediumCount: number;
  hardCount: number;
  avoidQuestionTexts: string[];
  subjectMix: string;
}): Promise<{ questions: DemoQuestion[] } | { error: string }> {
  const { totalQuestions, mediumCount, hardCount, avoidQuestionTexts, subjectMix } = args;
  const reasoningHeadroom =
    REASONING_TOKEN_HEADROOM[TERRA_TASK.reasoning_effort] ?? REASONING_TOKEN_HEADROOM.medium;
  const outputBudget = 800 + totalQuestions * 260;
  const maxCompletionTokens = outputBudget + reasoningHeadroom;

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: TERRA_TASK.reasoning_effort,
    messages: [
      { role: "user", content: buildPrompt({ totalQuestions, mediumCount, hardCount, avoidQuestionTexts, subjectMix }) },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: maxCompletionTokens,
  });

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) return { error: "OpenAI did not return any content." };

  let parsed: { questions?: unknown };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return { error: "Failed to parse AI response as JSON." };
  }

  const validationError = validateQuestions(parsed.questions, { totalQuestions, mediumCount, hardCount });
  if (validationError) return { error: validationError };

  const questions = (parsed.questions as DemoQuestion[]).map((q) => ({
    question_text: q.question_text.trim(),
    answer_choices: q.answer_choices.map((c) => c.trim()),
    correct_answer: q.correct_answer.trim(),
    explanation: q.explanation.trim(),
    topic: q.topic.trim(),
    difficulty: q.difficulty.trim().toLowerCase() === "hard" ? "Hard" : "Medium",
  }));

  return { questions };
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Generation is not configured right now." }, { status: 503 });
    }

    const clientIpHash = hashClientIp(getClientIp(req));
    if (isRateLimited(clientIpHash)) {
      return NextResponse.json(
        { error: "Too many demo requests from this network. Please wait a minute and retry." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const avoidQuestionTexts = Array.isArray(body?.avoidQuestionTexts)
      ? body.avoidQuestionTexts.filter((t: unknown): t is string => typeof t === "string").slice(0, MAX_AVOID_TOPICS)
      : [];
    const totalQuestions = clampQuestionCount(body?.count);
    const { mediumCount, hardCount } = splitMediumHard(totalQuestions);
    const subjectMix = SUBJECT_MIX_PRESETS[resolveSubjectMix(body?.subject)];

    const genArgs = { totalQuestions, mediumCount, hardCount, avoidQuestionTexts, subjectMix };
    let result = await generateOnce(genArgs);

    if ("error" in result) {
      result = await generateOnce(genArgs);
    }

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ questions: result.questions });
  } catch (error) {
    console.error("demo/generate-questions failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong generating demo questions." }, { status: 500 });
  }
}
