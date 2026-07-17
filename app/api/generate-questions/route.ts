import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createHash } from "node:crypto";
import { FREE_PLAN_IDS, PRIORITY_PLAN_IDS } from "@/lib/plans";
import { FREE_DAILY_BATTLE_CAP, FREE_DAILY_PDF_CAP } from "@/lib/planLimits";
import { hasUnbalancedMathDelimiters } from "@/lib/server/mathValidation";
import { TERRA_TASK, type ReasoningEffort } from "@/lib/server/aiModels";

// Reasoning-effort models spend part of max_completion_tokens on hidden
// reasoning before writing visible output, unlike the flat-rate gpt-4o-mini
// calls this route used before. Without this, generation was silently
// truncating mid-JSON on every escalated retry (higher effort = more
// reasoning tokens eaten from the same fixed budget), which is why battles
// were both slow (three doomed attempts back-to-back) and failing outright.
export const runtime = "nodejs";
export const maxDuration = 180;

// This client uses the SERVICE ROLE key, which is safe here because
// this code only ever runs on the server (inside this API route).
// Never send the service role key to the browser.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// The OpenAI key also stays on the server. The frontend never sees it.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Shape of a single quiz question returned by the AI
type GeneratedQuestion = {
  question_text: string;
  answer_choices: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: string;
  // Short verbatim quote from the notes supporting the correct answer.
  // Optional/best-effort: never required for validation, and cleared by
  // verifySourceExcerpts() if it doesn't actually appear in the notes.
  source_excerpt: string;
};

type QuestionType = "multiple_choice" | "true_false" | "open_response";
type DifficultyMode = "mixed" | "easy" | "medium" | "hard";
type ExamTrack = "lsat" | "mcat" | "nclex" | "ap";
// Only meaningful when questionType is "open_response": argumentation asks
// the student to defend a thesis with evidence; step_by_step asks them to
// work a multi-step problem, graded on process not just the final answer.
type ReasoningFormat = "argumentation" | "step_by_step";

const MIN_NOTES_WORD_COUNT = 30;
const ALLOWED_QUESTION_COUNTS = [5, 10, 15, 20, 25];
const ALLOWED_DIFFICULTY_MODES: DifficultyMode[] = [
  "mixed",
  "easy",
  "medium",
  "hard",
];
const ALLOWED_QUESTION_TYPES: QuestionType[] = [
  "multiple_choice",
  "true_false",
  "open_response",
];
const ALLOWED_REASONING_FORMATS: ReasoningFormat[] = ["argumentation", "step_by_step"];

type UploadKind = "manual" | "pdf" | "text" | "folder_text" | "image";

const CACHE_VECTOR_DIMENSIONS = 128;
const VECTOR_CACHE_CANDIDATE_LIMIT = 120;
const VECTOR_CACHE_MIN_SIMILARITY = 0.9;
const MAX_NOTES_CHARACTERS = 120_000;
const USER_BURST_WINDOW_SECONDS = 60;
const USER_BURST_LIMIT_FREE = 2;
const USER_BURST_LIMIT_PAID = 6;
const IP_BURST_WINDOW_SECONDS = 60;
const IP_BURST_LIMIT_FREE = 6;
const IP_BURST_LIMIT_PAID = 20;
const MAX_COMPLETION_TOKENS_DEFAULT = 2200;

// Hidden reasoning tokens for gpt-5.6-family models count against
// max_completion_tokens, same budget the visible JSON output has to fit in.
// Higher reasoning_effort means more of that budget gets spent thinking
// before the model ever writes a character of output, so a flat token cap
// that was tuned for a non-reasoning model truncates the response earlier
// at "high"/"xhigh" than it does at "medium" -- exactly backwards from what
// the retry ladder below needs. These headroom figures are deliberately
// generous; the API only bills for tokens actually used.
const REASONING_TOKEN_HEADROOM: Record<ReasoningEffort, number> = {
  none: 200,
  low: 800,
  medium: 2000,
  high: 5000,
  xhigh: 10000,
};

function computeCompletionTokenBudget(args: {
  itemCount: number;
  perItemTokens: number;
  baseTokens: number;
  effort: ReasoningEffort;
  floor: number;
}): number {
  const outputBudget = args.baseTokens + args.itemCount * args.perItemTokens;
  const reasoningHeadroom =
    REASONING_TOKEN_HEADROOM[args.effort] ?? REASONING_TOKEN_HEADROOM.medium;
  return Math.max(args.floor, outputBudget + reasoningHeadroom);
}

function isGenerationDisabledByKillSwitch(): boolean {
  const raw = (process.env.GENERATION_KILL_SWITCH || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)[0];

  const candidates = [
    firstForwarded,
    req.headers.get("x-real-ip") || "",
    req.headers.get("cf-connecting-ip") || "",
    req.headers.get("x-vercel-forwarded-for") || "",
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  return "unknown";
}

function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

async function verifyTurnstileToken(args: {
  token: string;
  remoteIp: string;
}): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return true;
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", args.token);
  if (args.remoteIp && args.remoteIp !== "unknown") {
    form.set("remoteip", args.remoteIp);
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }
    );

    if (!response.ok) return false;
    const json = (await response.json()) as { success?: boolean };
    return !!json.success;
  } catch {
    return false;
  }
}

function parseAllowedBetaCodes(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

function isBetaAccessCodeValid(submittedCode: string): boolean {
  const rawCodes =
    process.env.BETA_ACCESS_CODES || process.env.BETA_ACCESS_CODE || "";
  const allowedCodes = parseAllowedBetaCodes(rawCodes);

  // If no beta codes are configured, skip enforcement for local/dev safety.
  if (allowedCodes.length === 0) {
    return true;
  }

  return allowedCodes.some((allowed) => allowed === submittedCode.trim());
}

// Splits a total question count into easy/medium/hard counts. For "mixed",
// this mirrors the app's original 5:7:3 ratio (out of 15) scaled to
// whichever total the user picked. For a single selected difficulty, every
// question uses that one difficulty. Verified non-negative for every value
// in ALLOWED_QUESTION_COUNTS.
function computeDifficultyDistribution(
  total: number,
  mode: DifficultyMode
): { easy: number; medium: number; hard: number } {
  if (mode === "easy") return { easy: total, medium: 0, hard: 0 };
  if (mode === "medium") return { easy: 0, medium: total, hard: 0 };
  if (mode === "hard") return { easy: 0, medium: 0, hard: total };

  const easy = Math.round((total * 5) / 15);
  const hard = Math.round((total * 3) / 15);
  const medium = Math.max(total - easy - hard, 0);
  return { easy, medium, hard };
}

function buildPrompt(params: {
  notes: string;
  totalQuestions: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  questionType: QuestionType;
  gradeLevel?: string;
  topicFocus?: string;
  examTrack?: ExamTrack;
  examMode?: string;
  additionalGuidance?: string;
}): string {
  const {
    notes,
    totalQuestions,
    easyCount,
    mediumCount,
    hardCount,
    questionType,
    gradeLevel,
    topicFocus,
    examTrack,
    examMode,
    additionalGuidance,
  } = params;

  const isTrueFalse = questionType === "true_false";

  const choiceInstructions = isTrueFalse
    ? `- "answer_choices": must be EXACTLY the two strings ["True", "False"], in that exact order and exact casing.
- "correct_answer": must be EXACTLY "True" or EXACTLY "False" (matching one of the answer_choices exactly).`
    : `- "answer_choices": an array of EXACTLY 4 short, realistic, plausible answer strings. Wrong choices should be believable, not silly or obviously wrong.
- "correct_answer": must be an EXACT character-for-character match to one of the 4 strings in "answer_choices"`;

  const gradeLevelLine = gradeLevel
    ? `\nWrite every question at a vocabulary and complexity level appropriate for a ${gradeLevel} student.`
    : "";

  const topicFocusLine = topicFocus
    ? `\nFocus ONLY on the following specific topic within the notes: "${topicFocus}". If the notes contain other topics, ignore them — every question must relate directly to this topic.`
    : "";

  const exampleChoices = isTrueFalse
    ? `["True", "False"]`
    : `["...", "...", "...", "..."]`;

  const extraGuidanceBlock = additionalGuidance
    ? `\nAdditional correction guidance from a prior failed attempt:\n${additionalGuidance}`
    : "";

  const examGuidanceBlock = buildExamGuidanceBlock({
    examTrack,
    examMode,
    questionType,
  });

  const explanationRule = isTrueFalse
    ? `- "explanation": 1-2 concise sentences explaining why the statement is true or false based on the notes.`
    : examTrack
      ? `- "explanation": 2-4 concise sentences. Include why the correct answer is right AND why at least one strong distractor is wrong.`
      : `- "explanation": 2-3 concise sentences. Include why the correct answer is right AND why the single most tempting wrong choice is wrong.`;

  return `
You are a ${examTrack ? "high-stakes exam" : "quiz"} generator for a study app called StudyClash.

Read the notes below and create exactly ${totalQuestions} ${
    isTrueFalse ? "true/false" : "multiple-choice"
  } questions
that test understanding of the material. Every question must be answerable
using ONLY the information in the notes below. Do not introduce outside facts,
and do not invent details that are not present in the notes.
${gradeLevelLine}${topicFocusLine}${examGuidanceBlock}

Rules for every question:
- "question_text": a clear question based directly on the notes
- Math notation: whenever "question_text", an answer choice, or "explanation" contains a mathematical expression, equation, exponent, fraction, chemical formula, or similar notation, write it in LaTeX wrapped in single dollar signs for inline math (e.g. "$x^2 + 3x - 4 = 0$") or double dollar signs for a standalone/display equation (e.g. "$$\\int_0^1 x^2 \\, dx$$"). Do not use LaTeX for plain prose that happens to contain a number.
${choiceInstructions}
${explanationRule}
- "topic": a short label (2-4 words) for the subtopic this question covers
- "difficulty": exactly one of "easy", "medium", or "hard"
- "source_excerpt": a short EXACT quote (one sentence or clause, under 30 words) copied word-for-word from the notes below that directly supports the correct answer. Copy it verbatim — do not paraphrase, summarize, or fix typos. This lets the student click back to exactly where the answer came from.

Difficulty mix (must match exactly):
- Exactly ${easyCount} questions with difficulty "easy": a single fact or definition, stated close to how the notes phrase it.
- Exactly ${mediumCount} questions with difficulty "medium": requires connecting two related facts from the notes, or applying a definition/rule to a new example not literally stated in the notes.
- Exactly ${hardCount} questions with difficulty "hard": requires synthesizing multiple facts or steps from across the notes (not adjacent sentences), OR a scenario/application the notes never spell out that can only be solved by reasoning through the underlying concept. A hard question should NOT be answerable by matching keywords in the question to one sentence in the notes -- if you can point to a single line that gives away the answer, it is not hard. At least 2 of the 4 answer choices must be near-misses that a student with a common, specific misconception about this material would plausibly pick, not generic wrong answers.

Other rules:
- No two questions may test the exact same fact or be reworded duplicates of each other.
- Every question must be unique in what it tests.
- If the notes do not contain enough distinct material to support ${totalQuestions} unique, non-overlapping questions, do your best to cover every distinct fact, concept, or detail in the notes without repeating yourself.
- Favor conceptual understanding and application over shallow definition-recall: test whether the student understands WHY something is true or HOW to apply it, not just whether they can repeat a phrase from the notes.
- Vary the angle across the set: mix direct recall, "why"/"how" conceptual questions, application or scenario-style use of a concept, and at least one question that targets a common misconception (a wrong answer choice should reflect that misconception, not just be randomly incorrect).

Return ONLY valid JSON in this exact shape, with no extra text, no markdown, no code fences:
{
  "questions": [
    {
      "question_text": "...",
      "answer_choices": ${exampleChoices},
      "correct_answer": "...",
      "explanation": "...",
      "topic": "...",
      "difficulty": "...",
      "source_excerpt": "..."
    }
  ]
}
${extraGuidanceBlock}

Notes:
"""
${notes}
"""
`;
}

// Checks the raw notes before we even call the AI. Cheap, fast guard
// against wasting an API call on notes that can't realistically support
// a good quiz.
function validateNotes(notes: string): string | null {
  const trimmed = notes.trim();

  if (!trimmed) {
    return "Notes cannot be empty.";
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < MIN_NOTES_WORD_COUNT) {
    return `Your notes are too short to generate a good quiz. Please provide at least ${MIN_NOTES_WORD_COUNT} words of material.`;
  }

  return null;
}

function buildExamGuidanceBlock(args: {
  examTrack?: ExamTrack;
  examMode?: string;
  questionType: QuestionType;
}): string {
  const { examTrack, examMode, questionType } = args;
  if (!examTrack) return "";

  const modeLine = examMode
    ? `\nExam mode selected: ${examMode.replace(/_/g, " ")}.`
    : "";

  const modeSpecificGuidance = buildExamModeSpecificGuidance(examTrack, examMode);

  if (examTrack === "lsat") {
    return `\nGenerate LSAT-style prompts with argument structure focus.${modeLine}
- Prioritize logical flaw, inference, assumption, strengthen, and weaken analysis.
- Use short argument stimuli and dense reading-comprehension style passages from the notes.
- Keep choices subtle and close to each other in plausibility.
- Topic labels should use LSAT taxonomy terms like "flaw", "assumption", "inference", "main point", "strengthen", "weaken".
- When possible, create linked mini-sets by reusing the same stimulus for 2-4 consecutive questions and prefix question_text with a marker like "[Stimulus A]".
${modeSpecificGuidance}`;
  }

  if (examTrack === "mcat") {
    return `\nGenerate MCAT-style prompts with scientific reasoning emphasis.${modeLine}
- Favor passage-informed analysis and data interpretation over isolated fact recall.
- Simulate passage blocks by generating 2-5 related questions that share a common scientific setup and prefix question_text with markers like "[Passage A]".
- Topic labels should use MCAT section taxonomy terms like "C/P", "CARS", "B/B", "P/S".
- Explanations should be reasoning-first and reference what clue in the passage/stem supports the answer.
${modeSpecificGuidance}`;
  }

  if (examTrack === "nclex") {
    return `\nGenerate NCLEX-style prompts focused on clinical judgment and safety.${modeLine}
- Use realistic patient-case vignettes anchored to the notes.
- Prioritize safety, prioritization, delegation, and next-best-action decision pathways.
- Topic labels should use taxonomy terms like "priority", "safety", "pharmacology", "delegation", "assessment".
- When possible, create linked mini-sets by reusing one patient scenario for 2-4 consecutive questions and prefix question_text with markers like "[Case A]".
${modeSpecificGuidance}`;
  }

  return `\nGenerate AP exam-style prompts.${modeLine}
- Prioritize concept application and evidence-based reasoning tied to standards in the notes.
- Include a mix of stimulus-based interpretation and analytical questioning.
- Topic labels should align to AP-unit style categories from the notes.
- Use ${questionType === "true_false" ? "clear claim testing" : "high-quality distractors"} appropriate for AP prep.
- When possible, create linked mini-sets by reusing one source excerpt, chart, or scenario for 2-4 consecutive questions and prefix question_text with markers like "[Stimulus A]".
${modeSpecificGuidance}`;
}

function buildExamModeSpecificGuidance(
  examTrack: ExamTrack,
  examMode?: string
): string {
  if (!examMode) return "";

  if (examTrack === "lsat") {
    if (examMode === "lsat_logical_reasoning") {
      return "- Mode focus: Logical Reasoning. Emphasize assumption, flaw, strengthen, weaken, and inference stems.";
    }
    if (examMode === "lsat_reading_comprehension") {
      return "- Mode focus: Reading Comprehension. Emphasize author viewpoint, structure, main point, and passage detail questions.";
    }
    return "- Mode focus: Mixed LSAT. Balance Logical Reasoning and Reading Comprehension style prompts.";
  }

  if (examTrack === "mcat") {
    if (examMode === "mcat_cp") {
      return "- Mode focus: C/P. Emphasize chemistry/physics reasoning, units, trends, and mechanism-level interpretation from the notes.";
    }
    if (examMode === "mcat_cars") {
      return "- Mode focus: CARS. Emphasize passage logic, author intent, tone, and inference without outside science facts.";
    }
    if (examMode === "mcat_bb") {
      return "- Mode focus: B/B. Emphasize biological systems, pathways, and experimental interpretation from the notes.";
    }
    if (examMode === "mcat_ps") {
      return "- Mode focus: P/S. Emphasize behavioral concepts, study interpretation, and applied scenario analysis.";
    }
    return "- Mode focus: Mixed MCAT. Balance C/P, CARS, B/B, and P/S style thinking patterns.";
  }

  if (examTrack === "nclex") {
    if (examMode === "nclex_fundamentals") {
      return "- Mode focus: Fundamentals. Emphasize core nursing principles, safety checks, and first-line actions.";
    }
    if (examMode === "nclex_med_surg") {
      return "- Mode focus: Med-Surg. Emphasize acute care prioritization, monitoring, and intervention sequencing.";
    }
    if (examMode === "nclex_pharmacology") {
      return "- Mode focus: Pharmacology. Emphasize medication safety, side-effect recognition, and contraindication logic from the notes.";
    }
    if (examMode === "nclex_maternal_peds") {
      return "- Mode focus: Maternal/Peds. Emphasize age-appropriate care, maternal risk signals, and family safety priorities.";
    }
    return "- Mode focus: Mixed NCLEX. Balance patient safety, prioritization, and clinical judgment.";
  }

  if (examMode === "ap_stimulus") {
    return "- Mode focus: Stimulus-Based Analysis. Emphasize interpreting excerpts, visuals, data displays, and evidence use.";
  }
  if (examMode === "ap_free_response") {
    return "- Mode focus: Free-Response Prep. Emphasize claim-evidence-reasoning style prompts and analytical depth.";
  }
  return "- Mode focus: Mixed AP. Balance quick recall with analysis and evidence-based reasoning.";
}

type ExpectedShape = {
  total: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  choiceCount: number;
  questionType: QuestionType;
};

function normalizeQuestionText(value: unknown, index: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return `Question ${index + 1} from your notes`;
  }
  return text;
}

function ensureUniqueQuestionTexts(
  questions: GeneratedQuestion[]
): GeneratedQuestion[] {
  const seen = new Set<string>();

  return questions.map((question, index) => {
    let text = question.question_text.trim();
    if (!text) {
      text = `Question ${index + 1} from your notes`;
    }

    let uniqueText = text;
    let suffix = 2;
    while (seen.has(uniqueText.toLowerCase())) {
      uniqueText = `${text} (${suffix})`;
      suffix += 1;
    }

    seen.add(uniqueText.toLowerCase());
    return { ...question, question_text: uniqueText };
  });
}

function normalizeMultipleChoiceAnswerChoices(value: unknown): string[] {
  const sourceChoices = Array.isArray(value) ? value : [];
  const cleaned = sourceChoices
    .map((choice) => (typeof choice === "string" ? choice.trim() : ""))
    .filter(Boolean);

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const choice of cleaned) {
    const key = choice.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(choice);
    if (deduped.length === 4) break;
  }

  while (deduped.length < 4) {
    deduped.push(`Option ${deduped.length + 1}`);
  }

  return deduped;
}

function normalizeTrueFalseChoices(value: unknown, correctAnswer: unknown): {
  answerChoices: string[];
  correctAnswer: string;
} {
  const rawCorrect =
    typeof correctAnswer === "string" ? correctAnswer.trim().toLowerCase() : "";
  const fallbackCorrect = rawCorrect === "false" ? "False" : "True";

  if (Array.isArray(value)) {
    const normalized = value
      .map((choice) => (typeof choice === "string" ? choice.trim().toLowerCase() : ""))
      .filter(Boolean);
    if (normalized.includes("false") && normalized.includes("true")) {
      return {
        answerChoices: ["True", "False"],
        correctAnswer: rawCorrect === "false" ? "False" : "True",
      };
    }
  }

  return {
    answerChoices: ["True", "False"],
    correctAnswer: fallbackCorrect,
  };
}

function applyDifficultyMix(
  questions: GeneratedQuestion[],
  expected: ExpectedShape
): GeneratedQuestion[] {
  const orderedDifficulties = [
    ...Array(expected.easyCount).fill("easy"),
    ...Array(expected.mediumCount).fill("medium"),
    ...Array(expected.hardCount).fill("hard"),
  ] as Array<"easy" | "medium" | "hard">;

  return questions.map((question, index) => ({
    ...question,
    difficulty: orderedDifficulties[index] || "medium",
  }));
}

function normalizeQuestionsFromUnknown(
  questions: unknown,
  expected: ExpectedShape
): GeneratedQuestion[] {
  if (!Array.isArray(questions)) return [];

  const normalized = questions.map((rawQuestion, index) => {
    const candidate =
      rawQuestion && typeof rawQuestion === "object"
        ? (rawQuestion as Record<string, unknown>)
        : {};

    const questionText = normalizeQuestionText(candidate.question_text, index);
    const topic =
      typeof candidate.topic === "string" && candidate.topic.trim()
        ? candidate.topic.trim()
        : "General";
    const explanation =
      typeof candidate.explanation === "string" && candidate.explanation.trim()
        ? candidate.explanation.trim()
        : "Review your notes for why this answer is correct.";
    const sourceExcerpt =
      typeof candidate.source_excerpt === "string"
        ? candidate.source_excerpt.trim().slice(0, 400)
        : "";

    if (expected.questionType === "true_false") {
      const tf = normalizeTrueFalseChoices(
        candidate.answer_choices,
        candidate.correct_answer
      );

      return {
        question_text: questionText,
        answer_choices: tf.answerChoices,
        correct_answer: tf.correctAnswer,
        explanation,
        topic,
        difficulty: "medium",
        source_excerpt: sourceExcerpt,
      };
    }

    const answerChoices = normalizeMultipleChoiceAnswerChoices(
      candidate.answer_choices
    );
    const rawCorrect =
      typeof candidate.correct_answer === "string"
        ? candidate.correct_answer.trim()
        : "";
    const correctAnswer = answerChoices.includes(rawCorrect)
      ? rawCorrect
      : answerChoices[0];

    return {
      question_text: questionText,
      answer_choices: answerChoices,
      correct_answer: correctAnswer,
      explanation,
      topic,
      difficulty: "medium",
      source_excerpt: sourceExcerpt,
    };
  });

  if (normalized.length < expected.total) {
    return [];
  }

  const exactCount = normalized.slice(0, expected.total);
  const uniqueTextQuestions = ensureUniqueQuestionTexts(exactCount);
  return applyDifficultyMix(uniqueTextQuestions, expected);
}

// Validates the AI's parsed output against the exact counts/shape we asked
// for. Returns null if valid, or a string describing exactly what's wrong.
function validateQuestions(
  questions: unknown,
  expected: ExpectedShape
): string | null {
  if (!Array.isArray(questions)) {
    return "AI response was not a list of questions.";
  }

  if (questions.length !== expected.total) {
    return `Expected exactly ${expected.total} questions, got ${questions.length}.`;
  }

  const seenQuestionTexts = new Set<string>();
  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Partial<GeneratedQuestion>;
    const label = `Question ${i + 1}`;

    if (!q || typeof q !== "object") {
      return `${label} is not a valid object.`;
    }

    if (!q.question_text || typeof q.question_text !== "string" || !q.question_text.trim()) {
      return `${label} is missing question_text.`;
    }

    if (hasUnbalancedMathDelimiters(q.question_text)) {
      return `${label} has an unclosed math delimiter ($ or $$) in question_text.`;
    }

    if (
      !Array.isArray(q.answer_choices) ||
      q.answer_choices.length !== expected.choiceCount
    ) {
      return `${label} must have exactly ${expected.choiceCount} answer_choices.`;
    }

    const cleanedChoices = q.answer_choices.map((c) =>
      typeof c === "string" ? c.trim() : ""
    );

    if (cleanedChoices.some((c) => !c)) {
      return `${label} has an empty answer choice.`;
    }

    const uniqueChoices = new Set(cleanedChoices.map((c) => c.toLowerCase()));
    if (uniqueChoices.size !== expected.choiceCount) {
      return `${label} has duplicate answer choices.`;
    }

    if (cleanedChoices.some((c) => hasUnbalancedMathDelimiters(c))) {
      return `${label} has an unclosed math delimiter ($ or $$) in an answer choice.`;
    }

    if (expected.questionType === "true_false") {
      const exactSet = new Set(cleanedChoices);
      const isExactTrueFalse =
        exactSet.size === 2 && exactSet.has("True") && exactSet.has("False");
      if (!isExactTrueFalse) {
        return `${label} must use exactly "True" and "False" as its answer choices.`;
      }
    }

    if (
      !q.correct_answer ||
      typeof q.correct_answer !== "string" ||
      !cleanedChoices.includes(q.correct_answer.trim())
    ) {
      return `${label} has a correct_answer that does not exactly match one of its answer_choices.`;
    }

    if (!q.explanation || typeof q.explanation !== "string" || !q.explanation.trim()) {
      return `${label} is missing an explanation.`;
    }

    if (hasUnbalancedMathDelimiters(q.explanation)) {
      return `${label} has an unclosed math delimiter ($ or $$) in explanation.`;
    }

    if (!q.topic || typeof q.topic !== "string" || !q.topic.trim()) {
      return `${label} is missing a topic.`;
    }

    const difficulty = typeof q.difficulty === "string" ? q.difficulty.toLowerCase().trim() : "";
    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return `${label} has an invalid difficulty value.`;
    }

    if (difficulty === "easy") easyCount++;
    if (difficulty === "medium") mediumCount++;
    if (difficulty === "hard") hardCount++;

    const normalizedText = q.question_text.trim().toLowerCase();
    if (seenQuestionTexts.has(normalizedText)) {
      return `Duplicate question detected: "${q.question_text.trim()}"`;
    }
    seenQuestionTexts.add(normalizedText);
  }

  if (
    easyCount !== expected.easyCount ||
    mediumCount !== expected.mediumCount ||
    hardCount !== expected.hardCount
  ) {
    return `Difficulty mix is incorrect. Expected ${expected.easyCount} easy, ${expected.mediumCount} medium, ${expected.hardCount} hard — got ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard.`;
  }

  return null;
}

// Second-pass fact-check: asks the model to verify each generated question's
// stated correct_answer and explanation are actually supported by the source
// notes (not just structurally valid). Returns null if nothing is flagged
// (or if the check itself fails — we fail open so a flaky check never blocks
// generation), or a string describing what's ungrounded so it can be fed
// back into the same retry loop that handles schema errors.
async function runGroundingCheck(
  notes: string,
  questions: GeneratedQuestion[],
  attempt = 1
): Promise<string | null> {
  try {
    const maxCompletionTokens = computeCompletionTokenBudget({
      itemCount: questions.length,
      perItemTokens: 60,
      baseTokens: 300,
      effort: TERRA_TASK.reasoning_effort,
      floor: 1000,
    });

    const questionList = questions
      .map(
        (q, i) =>
          `${i}. Q: ${q.question_text}\nStated correct answer: ${q.correct_answer}\nStated explanation: ${q.explanation}`
      )
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: TERRA_TASK.model,
      reasoning_effort: TERRA_TASK.reasoning_effort,
      messages: [
        {
          role: "user",
          content: `You are a strict fact-checker for a study app. Below are SOURCE NOTES and a list of quiz questions generated from them, each with its stated correct answer and explanation.

For each question, check ONLY:
- Is the stated correct answer actually correct according to the source notes (not contradicted, not unsupported)?
- Does the explanation accurately reflect what the notes say, with no invented facts?

Flag a question ONLY if you find a clear, specific factual error or contradiction with the notes — not for style, phrasing, or difficulty.

Return ONLY valid JSON, no markdown, no extra text:
{"flagged": [{"index": 0, "reason": "short specific reason"}]}
If nothing is wrong, return {"flagged": []}.

SOURCE NOTES:
"""
${notes}
"""

QUESTIONS:
${questionList}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: maxCompletionTokens,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) return null;

    const parsed = JSON.parse(rawContent) as {
      flagged?: Array<{ index?: unknown; reason?: unknown }>;
    };

    const flagged = Array.isArray(parsed.flagged) ? parsed.flagged : [];
    if (flagged.length === 0) return null;

    const details = flagged
      .slice(0, 5)
      .map((f) => {
        const idx = typeof f.index === "number" ? f.index : -1;
        const reason =
          typeof f.reason === "string" && f.reason.trim()
            ? f.reason.trim()
            : "unspecified issue";
        const text = questions[idx]?.question_text || `question ${idx}`;
        return `"${text}" — ${reason}`;
      })
      .join("; ");

    return `Fact-check found ${flagged.length} question(s) not supported by the notes: ${details}`;
  } catch (error) {
    // Transient network/rate-limit blips shouldn't silently disable fact
    // -checking for an otherwise-fine generation, so retry once before
    // giving up. Still fails open after that (rather than blocking
    // generation outright) -- a flaky third-party call shouldn't be able to
    // take down question generation entirely -- but it's now logged instead
    // of vanishing silently.
    if (attempt < 2) {
      return runGroundingCheck(notes, questions, attempt + 1);
    }

    console.error(
      "Grounding fact-check failed after retry, generation proceeding unverified:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// The direct-valid path casts parsed.questions straight to
// GeneratedQuestion[] without going through normalizeQuestionsFromUnknown,
// so source_excerpt (not enforced by validateQuestions) needs its own safe
// extraction here rather than trusting the raw cast.
function attachSourceExcerpts(
  questions: Array<GeneratedQuestion & { source_excerpt?: unknown }>
): GeneratedQuestion[] {
  return questions.map((q) => ({
    ...q,
    source_excerpt:
      typeof q.source_excerpt === "string" ? q.source_excerpt.trim().slice(0, 400) : "",
  }));
}

function normalizeForExcerptMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isExcerptFoundInNotes(excerpt: string, notes: string): boolean {
  const trimmed = excerpt.trim();
  if (!trimmed) return false;
  return normalizeForExcerptMatch(notes).includes(normalizeForExcerptMatch(trimmed));
}

// Safety net against fabricated citations: only keep a source_excerpt if it
// actually appears in the notes (normalized for whitespace/smart quotes).
// A missing citation degrades gracefully in the UI; a false one would not.
function verifySourceExcerpts(
  questions: GeneratedQuestion[],
  notes: string
): GeneratedQuestion[] {
  return questions.map((q) => {
    const excerpt = q.source_excerpt?.trim();
    if (!excerpt) return { ...q, source_excerpt: "" };
    return { ...q, source_excerpt: isExcerptFoundInNotes(excerpt, notes) ? excerpt : "" };
  });
}

// Calls OpenAI once and returns either the validated questions or an
// error describing what went wrong (parsing failure, validation failure,
// or a failed fact-check against the source notes).
async function generateAndValidate(
  notes: string,
  genParams: {
    totalQuestions: number;
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    choiceCount: number;
    questionType: QuestionType;
    gradeLevel?: string;
    topicFocus?: string;
    examTrack?: ExamTrack;
    examMode?: string;
    additionalGuidance?: string;
    reasoningEffort?: ReasoningEffort;
  }
): Promise<{ questions: GeneratedQuestion[] } | { error: string }> {
  const effort = genParams.reasoningEffort ?? TERRA_TASK.reasoning_effort;
  const maxCompletionTokens = computeCompletionTokenBudget({
    itemCount: genParams.totalQuestions,
    perItemTokens: 260,
    baseTokens: 800,
    effort,
    floor: parsePositiveInt(
      process.env.OPENAI_MAX_COMPLETION_TOKENS,
      MAX_COMPLETION_TOKENS_DEFAULT
    ),
  });

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: effort,
    messages: [
      {
        role: "user",
        content: buildPrompt({
          notes,
          totalQuestions: genParams.totalQuestions,
          easyCount: genParams.easyCount,
          mediumCount: genParams.mediumCount,
          hardCount: genParams.hardCount,
          questionType: genParams.questionType,
          gradeLevel: genParams.gradeLevel,
          topicFocus: genParams.topicFocus,
          examTrack: genParams.examTrack,
          examMode: genParams.examMode,
          additionalGuidance: genParams.additionalGuidance,
        }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: maxCompletionTokens,
  });

  const rawContent = completion.choices[0]?.message?.content;

  if (!rawContent) {
    return { error: "OpenAI did not return any content." };
  }

  let parsed: { questions?: unknown };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return { error: "Failed to parse AI response as JSON." };
  }

  const expected = {
    total: genParams.totalQuestions,
    easyCount: genParams.easyCount,
    mediumCount: genParams.mediumCount,
    hardCount: genParams.hardCount,
    choiceCount: genParams.choiceCount,
    questionType: genParams.questionType,
  };

  const validationError = validateQuestions(parsed.questions, expected);
  if (!validationError) {
    const validQuestions = attachSourceExcerpts(
      parsed.questions as GeneratedQuestion[]
    );
    const groundingError = await runGroundingCheck(notes, validQuestions);
    if (groundingError) {
      return { error: groundingError };
    }
    return { questions: validQuestions };
  }

  // When the model gives mostly-correct content but misses strict shape
  // requirements, normalize the result server-side instead of failing.
  const normalizedQuestions = normalizeQuestionsFromUnknown(
    parsed.questions,
    expected
  );
  const normalizedValidationError = validateQuestions(
    normalizedQuestions,
    expected
  );

  if (!normalizedValidationError) {
    const groundingError = await runGroundingCheck(notes, normalizedQuestions);
    if (groundingError) {
      return { error: groundingError };
    }
    return { questions: normalizedQuestions };
  }

  const combinedError = `${validationError} | normalization failed: ${normalizedValidationError}`;

  if (combinedError.length > 500) {
    return { error: `${combinedError.slice(0, 500)}...` };
  }

  if (validationError) {
    return { error: combinedError };
  }

  return { error: "Validation failed unexpectedly." };
}

// ---------------------------------------------------------------------
// Open-response generation (argumentation / step-by-step battles)
//
// This is a deliberately separate pipeline from the multiple_choice/
// true_false path above rather than another branch threaded through it:
// the schema is different enough (rubric_points instead of answer_choices,
// no single correct_answer for argumentation prompts) that reusing
// validateQuestions/generateAndValidate would mean conditionals scattered
// through code that's already carrying a lot of MC/TF-specific assumptions.
// Caching and the fact-check grounding pass are intentionally skipped here
// for now -- open-response answers are graded against rubric_points at
// answer time (see /api/grade-open-response), which is itself a grounding
// check of sorts, and the generation_cache/vector-similarity cache simply
// stays a permanent miss for this type (harmless, just no speedup).
// ---------------------------------------------------------------------

type OpenResponseQuestion = {
  question_text: string;
  rubric_points: string[];
  final_answer: string;
  model_answer: string;
  topic: string;
  difficulty: string;
  source_excerpt: string;
};

function buildOpenResponsePrompt(params: {
  notes: string;
  totalQuestions: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  reasoningFormat: ReasoningFormat;
  gradeLevel?: string;
  topicFocus?: string;
  additionalGuidance?: string;
}): string {
  const {
    notes,
    totalQuestions,
    easyCount,
    mediumCount,
    hardCount,
    reasoningFormat,
    gradeLevel,
    topicFocus,
    additionalGuidance,
  } = params;

  const gradeLevelLine = gradeLevel
    ? `\nWrite every prompt at a vocabulary and complexity level appropriate for a ${gradeLevel} student.`
    : "";

  const topicFocusLine = topicFocus
    ? `\nFocus ONLY on the following specific topic within the notes: "${topicFocus}". Ignore other topics in the notes.`
    : "";

  const extraGuidanceBlock = additionalGuidance
    ? `\nAdditional correction guidance from a prior failed attempt:\n${additionalGuidance}`
    : "";

  const formatInstructions =
    reasoningFormat === "step_by_step"
      ? `Generate STEP-BY-STEP REASONING problems (math, physics, chemistry, or similar quantitative/procedural material from the notes). Each problem must require working through a multi-step process to reach an answer -- not a single-step lookup.
- "question_text": a problem statement that requires multiple steps to solve, using only facts/formulas/methods present in the notes.
- Math notation: write every equation, formula, exponent, fraction, or chemical formula in LaTeX -- wrap inline math in single dollar signs (e.g. "$F = ma$") and standalone/display equations in double dollar signs (e.g. "$$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$"). This applies to "question_text" and "model_answer" alike.
- "rubric_points": an ORDERED array of 3-5 short strings, each naming one required step in the correct solution process (e.g., "Identify the known variables", "Apply the formula for X", "Solve for the unknown", "State the final answer with correct units"). These are graded against, never shown to the student before they answer.
- "final_answer": the correct final numeric or short-form answer to the problem.
- "model_answer": the full worked solution, step by step, ending in the final answer.`
      : `Generate ARGUMENTATION prompts that ask the student to take and defend a position using evidence from the notes -- not a single-fact recall question.
- "question_text": a claim, thesis, or "should/why" prompt that invites the student to argue a position and support it with specific evidence or reasoning drawn from the notes.
- "rubric_points": an array of 2-4 short strings, each naming one specific piece of evidence or line of reasoning (grounded in the notes) that a strong answer should include. These are graded against, never shown to the student before they answer.
- "final_answer": leave this as an empty string "" -- argumentation prompts don't have one single correct answer.
- "model_answer": a strong example answer that hits every rubric point, 3-5 sentences.`;

  return `
You are a study-app quiz generator creating ${
    reasoningFormat === "step_by_step" ? "step-by-step reasoning problems" : "argumentation prompts"
  } for a battle mode called StudyClash that deliberately rewards slow, careful reasoning instead of fast recall.

Read the notes below and create exactly ${totalQuestions} prompts. Every prompt must be answerable using ONLY the information in the notes below -- do not introduce outside facts.
${gradeLevelLine}${topicFocusLine}

${formatInstructions}

Every item also needs:
- "topic": a short label (2-4 words) for the subtopic this covers
- "difficulty": exactly one of "easy", "medium", or "hard"
- "source_excerpt": a short EXACT quote (under 30 words) copied word-for-word from the notes that this prompt is grounded in. Copy verbatim, do not paraphrase.

Difficulty mix (must match exactly):
- Exactly ${easyCount} questions with difficulty "easy"
- Exactly ${mediumCount} questions with difficulty "medium"
- Exactly ${hardCount} questions with difficulty "hard"

No two prompts may test the same fact or process. Every prompt must be unique.

Return ONLY valid JSON in this exact shape, with no extra text, no markdown, no code fences:
{
  "questions": [
    {
      "question_text": "...",
      "rubric_points": ["...", "..."],
      "final_answer": "...",
      "model_answer": "...",
      "topic": "...",
      "difficulty": "...",
      "source_excerpt": "..."
    }
  ]
}
${extraGuidanceBlock}

Notes:
"""
${notes}
"""
`;
}

function validateOpenResponseQuestions(
  questions: unknown,
  expected: { total: number; easyCount: number; mediumCount: number; hardCount: number }
): string | null {
  if (!Array.isArray(questions)) {
    return "AI response was not a list of questions.";
  }

  if (questions.length !== expected.total) {
    return `Expected exactly ${expected.total} questions, got ${questions.length}.`;
  }

  const seenTexts = new Set<string>();
  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Partial<OpenResponseQuestion>;
    const label = `Question ${i + 1}`;

    if (!q || typeof q !== "object") {
      return `${label} is not a valid object.`;
    }

    if (!q.question_text || typeof q.question_text !== "string" || !q.question_text.trim()) {
      return `${label} is missing question_text.`;
    }

    if (hasUnbalancedMathDelimiters(q.question_text)) {
      return `${label} has an unclosed math delimiter ($ or $$) in question_text.`;
    }

    if (!Array.isArray(q.rubric_points) || q.rubric_points.length < 2) {
      return `${label} needs at least 2 rubric_points.`;
    }

    if (q.rubric_points.some((p) => typeof p !== "string" || !p.trim())) {
      return `${label} has an empty rubric_points entry.`;
    }

    if (typeof q.final_answer !== "string") {
      return `${label} is missing final_answer (use an empty string if not applicable).`;
    }

    if (!q.model_answer || typeof q.model_answer !== "string" || !q.model_answer.trim()) {
      return `${label} is missing model_answer.`;
    }

    if (hasUnbalancedMathDelimiters(q.model_answer)) {
      return `${label} has an unclosed math delimiter ($ or $$) in model_answer.`;
    }

    if (!q.topic || typeof q.topic !== "string" || !q.topic.trim()) {
      return `${label} is missing a topic.`;
    }

    const difficulty = typeof q.difficulty === "string" ? q.difficulty.toLowerCase().trim() : "";
    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return `${label} has an invalid difficulty value.`;
    }

    if (difficulty === "easy") easyCount++;
    if (difficulty === "medium") mediumCount++;
    if (difficulty === "hard") hardCount++;

    const normalizedText = q.question_text.trim().toLowerCase();
    if (seenTexts.has(normalizedText)) {
      return `Duplicate question detected: "${q.question_text.trim()}"`;
    }
    seenTexts.add(normalizedText);
  }

  if (
    easyCount !== expected.easyCount ||
    mediumCount !== expected.mediumCount ||
    hardCount !== expected.hardCount
  ) {
    return `Difficulty mix is incorrect. Expected ${expected.easyCount} easy, ${expected.mediumCount} medium, ${expected.hardCount} hard — got ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard.`;
  }

  return null;
}

async function generateAndValidateOpenResponse(
  notes: string,
  genParams: {
    totalQuestions: number;
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    reasoningFormat: ReasoningFormat;
    gradeLevel?: string;
    topicFocus?: string;
    additionalGuidance?: string;
    reasoningEffort?: ReasoningEffort;
  }
): Promise<{ questions: OpenResponseQuestion[] } | { error: string }> {
  const effort = genParams.reasoningEffort ?? TERRA_TASK.reasoning_effort;
  // Open-response items carry a full worked model_answer per question, so
  // the per-item output footprint is much bigger than MC/TF's.
  const maxCompletionTokens = computeCompletionTokenBudget({
    itemCount: genParams.totalQuestions,
    perItemTokens: 450,
    baseTokens: 800,
    effort,
    floor: parsePositiveInt(
      process.env.OPENAI_MAX_COMPLETION_TOKENS,
      MAX_COMPLETION_TOKENS_DEFAULT
    ),
  });

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: effort,
    messages: [
      {
        role: "user",
        content: buildOpenResponsePrompt({ notes, ...genParams }),
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: maxCompletionTokens,
  });

  const rawContent = completion.choices[0]?.message?.content;

  if (!rawContent) {
    return { error: "OpenAI did not return any content." };
  }

  let parsed: { questions?: unknown };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return { error: "Failed to parse AI response as JSON." };
  }

  const expected = {
    total: genParams.totalQuestions,
    easyCount: genParams.easyCount,
    mediumCount: genParams.mediumCount,
    hardCount: genParams.hardCount,
  };

  const validationError = validateOpenResponseQuestions(parsed.questions, expected);
  if (validationError) {
    return { error: validationError };
  }

  const rawQuestions = parsed.questions as Array<
    OpenResponseQuestion & { source_excerpt?: unknown }
  >;

  const questions: OpenResponseQuestion[] = rawQuestions.map((q) => ({
    question_text: q.question_text.trim(),
    rubric_points: q.rubric_points.map((p) => p.trim()),
    final_answer: q.final_answer.trim(),
    model_answer: q.model_answer.trim(),
    topic: q.topic.trim(),
    difficulty: q.difficulty.toLowerCase().trim(),
    source_excerpt:
      typeof q.source_excerpt === "string" ? q.source_excerpt.trim().slice(0, 400) : "",
  }));

  return { questions };
}

// Mirrors the deck-creation tail of POST() (steps 8-11) but for the
// open_response schema -- kept as its own function rather than folding into
// POST's shared flow so neither path has to reason about the other's
// column shape.
async function handleOpenResponseGeneration(args: {
  notes: string;
  studentName: string;
  courseName: string;
  deckTitle: string;
  userId: string;
  activePlanId: string;
  isPriorityPlan: boolean;
  normalizedUploadKind: UploadKind;
  clientIpHash: string;
  userAgent: string;
  totalQuestions: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  gradeLevel?: string;
  topicFocus?: string;
  reasoningFormat: ReasoningFormat;
}): Promise<NextResponse> {
  const {
    notes,
    studentName,
    courseName,
    deckTitle,
    userId,
    activePlanId,
    isPriorityPlan,
    normalizedUploadKind,
    clientIpHash,
    userAgent,
    totalQuestions,
    easyCount,
    mediumCount,
    hardCount,
    gradeLevel,
    topicFocus,
    reasoningFormat,
  } = args;

  const baseParams = {
    totalQuestions,
    easyCount,
    mediumCount,
    hardCount,
    reasoningFormat,
    gradeLevel,
    topicFocus,
  };

  let result = await generateAndValidateOpenResponse(notes, baseParams);

  // Only one retry, not two: with the token budget above sized to the
  // reasoning effort actually in play, a first-attempt truncation was almost
  // always the real cause of a failure here, not the model needing more
  // "thinking" -- so escalating straight to a second and much slower
  // "xhigh" attempt bought little beyond making a failing generation take
  // three times as long. If the single retry (at "high") still fails, that's
  // a genuine schema problem another slow attempt is unlikely to fix.
  if ("error" in result) {
    result = await generateAndValidateOpenResponse(notes, {
      ...baseParams,
      additionalGuidance:
        `Your previous output failed strict validation: ${result.error}. ` +
        "Return exactly the requested number of questions, valid rubric_points arrays, and an exact easy/medium/hard mix.",
      reasoningEffort: "high",
    });
  }

  if ("error" in result) {
    console.error("generate-questions (open_response) validation failure:", result.error);
    return NextResponse.json(
      {
        error:
          "We couldn't format a stable set of questions from this attempt. Your notes may still be fine. Please retry once.",
      },
      { status: 422 }
    );
  }

  const verifiedQuestions = result.questions.map((q) => ({
    ...q,
    source_excerpt:
      q.source_excerpt && isExcerptFoundInNotes(q.source_excerpt, notes) ? q.source_excerpt : "",
  }));

  const { data: deckData, error: deckError } = await supabase
    .from("decks")
    .insert({
      student_name: studentName,
      course_name: courseName,
      title: deckTitle,
      raw_notes: notes,
      user_id: userId,
    })
    .select()
    .single();

  if (deckError) {
    console.error("Failed to save open-response deck:", deckError.message);
    return NextResponse.json(
      { error: "We generated your questions but couldn't save the deck. Please try again." },
      { status: 500 }
    );
  }

  const deckId = deckData.id;

  const questionsToInsert = verifiedQuestions.map((q) => ({
    deck_id: deckId,
    question_text: q.question_text,
    answer_choices: [] as string[],
    correct_answer: q.final_answer,
    explanation: q.model_answer,
    topic: q.topic,
    difficulty: q.difficulty,
    source_excerpt: q.source_excerpt || null,
    question_type: "open_response",
    rubric_points: q.rubric_points,
    reasoning_format: reasoningFormat,
  }));

  const { error: questionsError } = await supabase.from("questions").insert(questionsToInsert);

  if (questionsError) {
    console.error("Failed to save open-response questions:", questionsError.message);
    await supabase.from("decks").delete().eq("id", deckId);
    return NextResponse.json(
      { error: "We generated your questions but couldn't save the deck. Please try again." },
      { status: 500 }
    );
  }

  let { error: logError } = await supabase.from("generation_logs").insert({
    user_id: userId,
    deck_id: deckId,
    source_kind: normalizedUploadKind,
    is_priority: isPriorityPlan,
    plan_id_snapshot: activePlanId,
    ip_hash: clientIpHash,
    user_agent_snapshot: userAgent || null,
    notes_char_count: notes.trim().length,
  });

  if (logError) {
    const fallback = await supabase.from("generation_logs").insert({
      user_id: userId,
      deck_id: deckId,
      source_kind: normalizedUploadKind,
      is_priority: isPriorityPlan,
      plan_id_snapshot: activePlanId,
    });
    logError = fallback.error;
  }

  if (logError) {
    console.error("Failed to insert generation log:", logError.message);
  }

  return NextResponse.json({ deckId });
}

export async function POST(req: NextRequest) {
  try {
    // 1. Require a logged-in user BEFORE doing anything else — no OpenAI
    // call, no Supabase insert, nothing costs money until we know who's
    // asking and whether they're allowed to.
    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Please log in to generate a deck." },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Please log in to generate a deck." },
        { status: 401 }
      );
    }

    if (isGenerationDisabledByKillSwitch()) {
      return NextResponse.json(
        { error: "Generation is temporarily paused. Please try again later." },
        { status: 503 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Generation is not configured right now." },
        { status: 503 }
      );
    }

    const clientIp = getClientIp(req);
    const clientIpHash = hashClientIp(clientIp);
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 512);

    // 2. Read the data sent from the frontend form
    const body = await req.json();
    const {
      studentName,
      courseName,
      deckTitle,
      notes,
      betaAccessCode,
      topicFocus,
      gradeLevel,
      difficulty,
      questionCount,
      questionType,
      reasoningFormat,
      uploadKind,
      examTrack,
      examMode,
      turnstileToken,
    } = body;

    const normalizedUploadKind = normalizeUploadKind(uploadKind);

    if (!studentName || !courseName || !deckTitle || !notes) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    if (typeof notes !== "string" || notes.trim().length > MAX_NOTES_CHARACTERS) {
      return NextResponse.json(
        {
          error:
            "Notes are too large for one request. Please shorten or split them into smaller sections.",
        },
        { status: 413 }
      );
    }

    const turnstileRequired =
      (process.env.TURNSTILE_REQUIRED || "").trim().toLowerCase() === "true";
    const trimmedTurnstileToken =
      typeof turnstileToken === "string" ? turnstileToken.trim() : "";

    if (turnstileRequired && !trimmedTurnstileToken) {
      return NextResponse.json(
        { error: "Bot verification is required before generating." },
        { status: 403 }
      );
    }

    if (trimmedTurnstileToken) {
      const verified = await verifyTurnstileToken({
        token: trimmedTurnstileToken,
        remoteIp: clientIp,
      });

      if (!verified) {
        return NextResponse.json(
          { error: "Bot verification failed. Please try again." },
          { status: 403 }
        );
      }
    }

    // 3. Load the user's profile to find their plan
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        { error: "Could not load your account. Please try again." },
        { status: 500 }
      );
    }

    // 4. Load the plan's daily limit (null = unlimited)
    const { data: planData, error: planError } = await supabase
      .from("membership_plans")
      .select("daily_limit")
      .eq("id", profileData.plan)
      .single();

    if (planError || !planData) {
      return NextResponse.json(
        { error: "Could not load your plan details. Please try again." },
        { status: 500 }
      );
    }

    const dailyLimit: number | null = planData.daily_limit;
    const activePlanId = String(profileData.plan || "free_beta");
    const isFreePlan = FREE_PLAN_IDS.has(activePlanId);
    const isPriorityPlan = PRIORITY_PLAN_IDS.has(activePlanId);
    const userBurstLimit = isFreePlan ? USER_BURST_LIMIT_FREE : USER_BURST_LIMIT_PAID;
    const ipBurstLimit = isFreePlan ? IP_BURST_LIMIT_FREE : IP_BURST_LIMIT_PAID;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayIso = startOfToday.toISOString();

    const userBurstSince = new Date(Date.now() - USER_BURST_WINDOW_SECONDS * 1000).toISOString();
    const { count: userBurstCount, error: userBurstError } = await supabase
      .from("generation_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", userBurstSince);

    if (userBurstError) {
      return NextResponse.json(
        { error: "Could not check request rate right now. Please try again." },
        { status: 500 }
      );
    }

    if ((userBurstCount || 0) >= userBurstLimit) {
      return NextResponse.json(
        { error: "Too many generation attempts. Please wait a minute and retry." },
        { status: 429 }
      );
    }

    const ipBurstSince = new Date(Date.now() - IP_BURST_WINDOW_SECONDS * 1000).toISOString();
    const { count: ipBurstCount, error: ipBurstError } = await supabase
      .from("generation_logs")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", clientIpHash)
      .gte("created_at", ipBurstSince);

    if (!ipBurstError && (ipBurstCount || 0) >= ipBurstLimit) {
      return NextResponse.json(
        {
          error:
            "Too many generation attempts from this network. Please wait a minute and retry.",
        },
        { status: 429 }
      );
    }

    if (isFreePlan) {
      if (typeof betaAccessCode !== "string" || !betaAccessCode.trim()) {
        return NextResponse.json(
          { error: "Beta access code is required." },
          { status: 400 }
        );
      }

      if (!isBetaAccessCodeValid(betaAccessCode)) {
        return NextResponse.json(
          { error: "Invalid beta access code." },
          { status: 403 }
        );
      }
    }

    if (isFreePlan) {
      const trimmedPlayerName = String(studentName || "").trim();
      if (trimmedPlayerName) {
        const { count: battleCountToday, error: battleCountError } = await supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("player_name", trimmedPlayerName)
          .gte("created_at", startOfTodayIso);

        if (battleCountError) {
          return NextResponse.json(
            { error: "Could not check your battle usage right now. Please try again." },
            { status: 500 }
          );
        }

        if ((battleCountToday || 0) >= FREE_DAILY_BATTLE_CAP) {
          return NextResponse.json(
            {
              error: `You've completed ${FREE_DAILY_BATTLE_CAP} battles today, so new deck generation is paused until tomorrow on the Free plan. You can still replay your existing decks. Upgrade to Student Pro to generate anytime.`,
            },
            { status: 429 }
          );
        }
      }

      if (normalizedUploadKind === "pdf") {
        const { count: pdfCountToday, error: pdfCountError } = await supabase
          .from("generation_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("source_kind", "pdf")
          .gte("created_at", startOfTodayIso);

        if (pdfCountError) {
          return NextResponse.json(
            { error: "Could not check your PDF usage right now. Please try again." },
            { status: 500 }
          );
        }

        if ((pdfCountToday || 0) >= FREE_DAILY_PDF_CAP) {
          return NextResponse.json(
            {
              error:
                "Free plan limit reached: 2 PDF uploads today. Upgrade to Student Pro for unlimited uploads.",
            },
            { status: 429 }
          );
        }
      }
    }

    // 5. If the plan has a limit (not unlimited), count today's generations
    if (dailyLimit !== null) {
      const { count, error: countError } = await supabase
        .from("generation_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startOfTodayIso);

      if (countError) {
        return NextResponse.json(
          { error: "Could not check your usage. Please try again." },
          { status: 500 }
        );
      }

      if ((count || 0) >= dailyLimit) {
        const message = isFreePlan
          ? "Daily generation limit reached for the Free plan. Upgrade on Pricing for higher limits."
          : "Daily generation limit reached.";
        return NextResponse.json(
          { error: message },
          { status: 429 }
        );
      }
    }

    // Sanitize the guided generation fields. These only ever shape the
    // prompt/validation below — they are not stored on the deck itself, so
    // an invalid or missing value here just falls back to a safe default
    // rather than failing the request.
    const sanitizedQuestionCount = ALLOWED_QUESTION_COUNTS.includes(
      Number(questionCount)
    )
      ? Number(questionCount)
      : 15;

    const sanitizedDifficultyMode: DifficultyMode =
      typeof difficulty === "string" &&
      ALLOWED_DIFFICULTY_MODES.includes(difficulty as DifficultyMode)
        ? (difficulty as DifficultyMode)
        : "mixed";

    const sanitizedQuestionType: QuestionType =
      typeof questionType === "string" &&
      ALLOWED_QUESTION_TYPES.includes(questionType as QuestionType)
        ? (questionType as QuestionType)
        : "multiple_choice";

    const sanitizedReasoningFormat: ReasoningFormat =
      typeof reasoningFormat === "string" &&
      ALLOWED_REASONING_FORMATS.includes(reasoningFormat as ReasoningFormat)
        ? (reasoningFormat as ReasoningFormat)
        : "argumentation";

    const sanitizedGradeLevel =
      typeof gradeLevel === "string" ? gradeLevel.trim().slice(0, 100) : "";

    const sanitizedTopicFocus =
      typeof topicFocus === "string" ? topicFocus.trim().slice(0, 200) : "";
    const sanitizedExamTrack = normalizeExamTrack(examTrack);
    const sanitizedExamMode = normalizeExamMode(examMode);

    const { easy, medium, hard } = computeDifficultyDistribution(
      sanitizedQuestionCount,
      sanitizedDifficultyMode
    );
    const choiceCount = sanitizedQuestionType === "true_false" ? 2 : 4;
    const sourceHash = buildSourceHash(notes);
    const sourceVector = buildSourceVector(notes);
    const cacheKey = buildGenerationCacheKey({
      sourceHash,
      questionCount: sanitizedQuestionCount,
      difficultyMode: sanitizedDifficultyMode,
      questionType: sanitizedQuestionType,
      gradeLevel: sanitizedGradeLevel,
      topicFocus: sanitizedTopicFocus,
      examTrack: sanitizedExamTrack || "",
      examMode: sanitizedExamMode,
    });

    // 6. Validate the notes themselves before spending an AI call on them
    const notesError = validateNotes(notes);
    if (notesError) {
      return NextResponse.json({ error: notesError }, { status: 400 });
    }

    // Open-response decks (argumentation / step-by-step) use a completely
    // different schema and skip the MC/TF cache + retry machinery below --
    // see handleOpenResponseGeneration for why this is a separate function
    // rather than more conditionals threaded through the path below.
    if (sanitizedQuestionType === "open_response") {
      return await handleOpenResponseGeneration({
        notes,
        studentName,
        courseName,
        deckTitle,
        userId: user.id,
        activePlanId,
        isPriorityPlan,
        normalizedUploadKind,
        clientIpHash,
        userAgent,
        totalQuestions: sanitizedQuestionCount,
        easyCount: easy,
        mediumCount: medium,
        hardCount: hard,
        gradeLevel: sanitizedGradeLevel || undefined,
        topicFocus: sanitizedTopicFocus || undefined,
        reasoningFormat: sanitizedReasoningFormat,
      });
    }

    // 7. Generate + validate. If the first attempt fails validation
    // (malformed JSON, wrong count, mismatched correct_answer, wrong
    // difficulty mix, duplicates, etc.), retry exactly once before
    // giving up with a clean error.
    const genParams = {
      totalQuestions: sanitizedQuestionCount,
      easyCount: easy,
      mediumCount: medium,
      hardCount: hard,
      choiceCount,
      questionType: sanitizedQuestionType,
      gradeLevel: sanitizedGradeLevel || undefined,
      topicFocus: sanitizedTopicFocus || undefined,
      examTrack: sanitizedExamTrack || undefined,
      examMode: sanitizedExamMode || undefined,
    };

    let questions: GeneratedQuestion[] | null = null;
    let cacheHitRowId: string | null = null;
    let cacheHitCount = 0;

    try {
      const { data: cachedRow } = await supabase
        .from("generation_cache")
        .select("id, questions, hit_count")
        .eq("cache_key", cacheKey)
        .single();

      const cachedQuestions = (cachedRow?.questions || null) as unknown;
      if (Array.isArray(cachedQuestions)) {
        const validationError = validateQuestions(cachedQuestions, {
          total: sanitizedQuestionCount,
          easyCount: easy,
          mediumCount: medium,
          hardCount: hard,
          choiceCount,
          questionType: sanitizedQuestionType,
        });

        if (!validationError) {
          questions = cachedQuestions as GeneratedQuestion[];
          cacheHitRowId = cachedRow?.id || null;
          cacheHitCount = Number(cachedRow?.hit_count || 0);
        }
      }
    } catch {
      // Cache table may not exist yet in some environments; continue normally.
    }

    if (questions === null) {
      try {
        let candidateQuery = supabase
          .from("generation_cache")
          .select("id, questions, source_vector, hit_count")
          .eq("question_count", sanitizedQuestionCount)
          .eq("difficulty_mode", sanitizedDifficultyMode)
          .eq("question_type", sanitizedQuestionType)
          .eq("source_kind", normalizedUploadKind)
          .order("updated_at", { ascending: false })
          .limit(VECTOR_CACHE_CANDIDATE_LIMIT);

        if (sanitizedGradeLevel) {
          candidateQuery = candidateQuery.eq("grade_level", sanitizedGradeLevel);
        } else {
          candidateQuery = candidateQuery.is("grade_level", null);
        }

        if (sanitizedTopicFocus) {
          candidateQuery = candidateQuery.eq("topic_focus", sanitizedTopicFocus);
        } else {
          candidateQuery = candidateQuery.is("topic_focus", null);
        }

        const { data: candidateRows } = await candidateQuery;

        let bestSimilarity = 0;
        let bestQuestions: GeneratedQuestion[] | null = null;
        let bestRowId: string | null = null;
        let bestHitCount = 0;

        for (const row of candidateRows || []) {
          const candidateVector = toVectorFromUnknown(row.source_vector);
          if (!candidateVector) continue;

          const similarity = cosineSimilarity(sourceVector, candidateVector);
          if (similarity < VECTOR_CACHE_MIN_SIMILARITY || similarity <= bestSimilarity) {
            continue;
          }

          const candidateQuestions = row.questions as unknown;
          if (!Array.isArray(candidateQuestions)) continue;

          const validationError = validateQuestions(candidateQuestions, {
            total: sanitizedQuestionCount,
            easyCount: easy,
            mediumCount: medium,
            hardCount: hard,
            choiceCount,
            questionType: sanitizedQuestionType,
          });

          if (validationError) continue;

          bestSimilarity = similarity;
          bestQuestions = candidateQuestions as GeneratedQuestion[];
          bestRowId = row.id as string;
          bestHitCount = Number(row.hit_count || 0);
        }

        if (bestQuestions) {
          questions = bestQuestions;
          cacheHitRowId = bestRowId;
          cacheHitCount = bestHitCount;
        }
      } catch {
        // Similarity cache lookup is optional; continue with OpenAI generation.
      }
    }

    if (questions !== null && cacheHitRowId) {
      try {
        await supabase
          .from("generation_cache")
          .update({
            hit_count: cacheHitCount + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cacheHitRowId);
      } catch {
        // Hit count update is optional.
      }
    }

    let result =
      questions !== null
        ? ({ questions } as { questions: GeneratedQuestion[] })
        : await generateAndValidate(notes, genParams);

    // Only one retry, not two -- see the matching comment in
    // handleOpenResponseGeneration for why a second, "xhigh" attempt isn't
    // worth the extra latency now that the token budget is sized correctly.
    if ("error" in result) {
      result = await generateAndValidate(notes, {
        ...genParams,
        additionalGuidance:
          `Your previous output failed strict validation: ${result.error}. ` +
          "Return exactly the requested number of questions, exact answer choice count per question type, and an exact easy/medium/hard mix.",
        reasoningEffort: "high",
      });
    }

    if ("error" in result) {
      console.error("generate-questions validation failure:", result.error);
      return NextResponse.json(
        {
          error:
            "We couldn't format a stable quiz from this attempt. Your notes may still be fine. Please retry once.",
        },
        { status: 422 }
      );
    }

    // Re-verify citations even for cache hits: cheap, and guards against any
    // stale cached rows whose excerpt no longer matches (or predates this
    // field entirely).
    questions = verifySourceExcerpts(result.questions, notes);

    // 8. Save the deck first, so we get a deck_id to attach questions to
    const { data: deckData, error: deckError } = await supabase
      .from("decks")
      .insert({
        student_name: studentName,
        course_name: courseName,
        title: deckTitle,
        raw_notes: notes,
        user_id: user.id,
      })
      .select()
      .single();

    if (deckError) {
      console.error("Failed to save deck:", deckError.message);
      return NextResponse.json(
        { error: "We generated your questions but couldn't save the deck. Please try again." },
        { status: 500 }
      );
    }

    const deckId = deckData.id;

    // 9. Prepare the questions for insertion, linking each to the deck
    const questionsToInsert = questions.map((q) => ({
      deck_id: deckId,
      question_text: q.question_text.trim(),
      answer_choices: q.answer_choices.map((c) => c.trim()),
      correct_answer: q.correct_answer.trim(),
      explanation: q.explanation.trim(),
      topic: q.topic.trim(),
      difficulty: q.difficulty.toLowerCase().trim(),
      source_excerpt: q.source_excerpt?.trim() || null,
      question_type: sanitizedQuestionType,
    }));

    const { error: questionsError } = await supabase
      .from("questions")
      .insert(questionsToInsert);

    if (questionsError) {
      console.error("Failed to save questions:", questionsError.message);
      // The deck was already created but its questions failed to save.
      // Clean up the orphaned deck so it doesn't show up as a broken,
      // empty deck in /decks.
      await supabase.from("decks").delete().eq("id", deckId);

      return NextResponse.json(
        { error: "We generated your questions but couldn't save the deck. Please try again." },
        { status: 500 }
      );
    }

    try {
      await supabase.from("generation_cache").upsert(
        {
          cache_key: cacheKey,
          source_hash: sourceHash,
          source_kind: normalizedUploadKind,
          question_count: sanitizedQuestionCount,
          difficulty_mode: sanitizedDifficultyMode,
          question_type: sanitizedQuestionType,
          grade_level: sanitizedGradeLevel || null,
          topic_focus: sanitizedTopicFocus || null,
          source_vector: sourceVector,
          source_text_length: notes.trim().length,
          questions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" }
      );
    } catch {
      // Cache write is optional. Deck generation should still succeed.
    }

    // 10. Log this generation so daily limits can be enforced going forward.
    let { error: logError } = await supabase.from("generation_logs").insert({
      user_id: user.id,
      deck_id: deckId,
      source_kind: normalizedUploadKind,
      is_priority: isPriorityPlan,
      plan_id_snapshot: activePlanId,
      ip_hash: clientIpHash,
      user_agent_snapshot: userAgent || null,
      notes_char_count: notes.trim().length,
    });

    if (logError) {
      const fallback = await supabase.from("generation_logs").insert({
        user_id: user.id,
        deck_id: deckId,
        source_kind: normalizedUploadKind,
        is_priority: isPriorityPlan,
        plan_id_snapshot: activePlanId,
      });
      logError = fallback.error;
    }

    if (logError) {
      console.error("Failed to insert generation log:", logError.message);
    }

    // 11. Send the new deck's id back to the frontend
    return NextResponse.json({ deckId });
  } catch (err) {
    // Catch-all for anything unexpected (AI provider errors, PDF parsing
    // failures, etc.) that wasn't already handled with a specific friendly
    // message above -- log the real error server-side, never forward raw
    // provider/library error text to the client.
    console.error("Unhandled error in /api/generate-questions:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Something went wrong generating your deck. Please try again." },
      { status: 500 }
    );
  }
}

function normalizeUploadKind(value: unknown): UploadKind {
  const raw = typeof value === "string" ? value : "manual";
  const allowed: UploadKind[] = ["manual", "pdf", "text", "folder_text", "image"];
  return allowed.includes(raw as UploadKind) ? (raw as UploadKind) : "manual";
}

function normalizeExamTrack(value: unknown): ExamTrack | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "lsat") return "lsat";
  if (normalized === "mcat") return "mcat";
  if (normalized === "nclex") return "nclex";
  if (normalized === "ap") return "ap";
  return null;
}

function normalizeExamMode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().slice(0, 64);
}

function buildSourceHash(notes: string): string {
  const normalized = notes.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

function tokenizeForVector(notes: string): string[] {
  return notes
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function hashTokenToIndex(token: string, dimensions: number): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  return hash % dimensions;
}

function buildSourceVector(notes: string, dimensions = CACHE_VECTOR_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenizeForVector(notes);

  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const index = hashTokenToIndex(token, dimensions);
    vector[index] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;

  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function toVectorFromUnknown(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const vector = value
    .map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : 0))
    .slice(0, CACHE_VECTOR_DIMENSIONS);

  if (vector.length !== CACHE_VECTOR_DIMENSIONS) return null;
  return vector;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }

  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / Math.sqrt(aNorm * bNorm);
}

function buildGenerationCacheKey(args: {
  sourceHash: string;
  questionCount: number;
  difficultyMode: DifficultyMode;
  questionType: QuestionType;
  gradeLevel: string;
  topicFocus: string;
  examTrack: string;
  examMode: string;
}): string {
  const {
    sourceHash,
    questionCount,
    difficultyMode,
    questionType,
    gradeLevel,
    topicFocus,
    examTrack,
    examMode,
  } = args;
  const normalizedGrade = gradeLevel.trim().toLowerCase();
  const normalizedFocus = topicFocus.trim().toLowerCase();
  const normalizedTrack = examTrack.trim().toLowerCase();
  const normalizedMode = examMode.trim().toLowerCase();
  return [
    sourceHash,
    String(questionCount),
    difficultyMode,
    questionType,
    normalizedGrade,
    normalizedFocus,
    normalizedTrack,
    normalizedMode,
  ].join("|");
}