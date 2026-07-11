import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createHash } from "node:crypto";
import { FREE_PLAN_IDS, PRIORITY_PLAN_IDS } from "@/lib/plans";

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
};

type QuestionType = "multiple_choice" | "true_false";
type DifficultyMode = "mixed" | "easy" | "medium" | "hard";
type ExamTrack = "lsat" | "mcat" | "nclex" | "ap";

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
];

type UploadKind = "manual" | "pdf" | "text" | "folder_text";

const FREE_DAILY_BATTLE_CAP = 3;
const FREE_DAILY_PDF_CAP = 2;
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

  const explanationRule = examTrack
    ? `- "explanation": 2-4 concise sentences. Include why the correct answer is right AND why at least one strong distractor is wrong.`
    : `- "explanation": 1-2 short sentences explaining why the correct answer is right`;

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
${choiceInstructions}
${explanationRule}
- "topic": a short label (2-4 words) for the subtopic this question covers
- "difficulty": exactly one of "easy", "medium", or "hard"

Difficulty mix (must match exactly):
- Exactly ${easyCount} questions with difficulty "easy" (basic recall/definitions)
- Exactly ${mediumCount} questions with difficulty "medium" (applying or connecting concepts)
- Exactly ${hardCount} questions with difficulty "hard" (nuanced or multi-step reasoning)

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
      "difficulty": "..."
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

// Calls OpenAI once and returns either the validated questions or an
// error describing what went wrong (parsing failure or validation failure).
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
    temperature?: number;
  }
): Promise<{ questions: GeneratedQuestion[] } | { error: string }> {
  const maxCompletionTokens = parsePositiveInt(
    process.env.OPENAI_MAX_COMPLETION_TOKENS,
    MAX_COMPLETION_TOKENS_DEFAULT
  );

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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
    temperature: genParams.temperature ?? 0.5,
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
    return { questions: parsed.questions as GeneratedQuestion[] };
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
              error:
                "Free Beta limit reached: 3 battles today. Pilot plans include both free and low-cost options for higher limits.",
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
                "Free Beta limit reached: 2 PDF uploads today. Pilot plans include both free and low-cost options for higher limits.",
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
          ? "Daily generation limit reached for Free Beta. Upgrade on Pricing for higher limits."
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

    if ("error" in result) {
      result = await generateAndValidate(notes, {
        ...genParams,
        additionalGuidance:
          `Your previous output failed strict validation: ${result.error}. ` +
          "Return exactly the requested number of questions, exact answer choice count per question type, and an exact easy/medium/hard mix.",
        temperature: 0.3,
      });
    }

    if ("error" in result) {
      result = await generateAndValidate(notes, {
        ...genParams,
        additionalGuidance:
          `Second failure reason: ${result.error}. ` +
          "Do not change schema. Prioritize strict JSON correctness over variety.",
        temperature: 0.2,
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

    questions = result.questions;

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
      return NextResponse.json({ error: deckError.message }, { status: 500 });
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
    }));

    const { error: questionsError } = await supabase
      .from("questions")
      .insert(questionsToInsert);

    if (questionsError) {
      // The deck was already created but its questions failed to save.
      // Clean up the orphaned deck so it doesn't show up as a broken,
      // empty deck in /decks.
      await supabase.from("decks").delete().eq("id", deckId);

      return NextResponse.json(
        { error: questionsError.message },
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
    const message =
      err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeUploadKind(value: unknown): UploadKind {
  const raw = typeof value === "string" ? value : "manual";
  const allowed: UploadKind[] = ["manual", "pdf", "text", "folder_text"];
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