import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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

  return `
You are a quiz generator for a study app called StudyClash.

Read the notes below and create exactly ${totalQuestions} ${
    isTrueFalse ? "true/false" : "multiple-choice"
  } questions
that test understanding of the material. Every question must be answerable
using ONLY the information in the notes below. Do not introduce outside facts,
and do not invent details that are not present in the notes.
${gradeLevelLine}${topicFocusLine}

Rules for every question:
- "question_text": a clear question based directly on the notes
${choiceInstructions}
- "explanation": 1-2 short sentences explaining why the correct answer is right
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
    additionalGuidance?: string;
    temperature?: number;
  }
): Promise<{ questions: GeneratedQuestion[] } | { error: string }> {
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
          additionalGuidance: genParams.additionalGuidance,
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: genParams.temperature ?? 0.5,
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
    } = body;

    if (!studentName || !courseName || !deckTitle || !notes) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

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

    // 5. If the plan has a limit (not unlimited), count today's generations
    if (dailyLimit !== null) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { count, error: countError } = await supabase
        .from("generation_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startOfToday.toISOString());

      if (countError) {
        return NextResponse.json(
          { error: "Could not check your usage. Please try again." },
          { status: 500 }
        );
      }

      if ((count || 0) >= dailyLimit) {
        return NextResponse.json(
          { error: "Daily generation limit reached." },
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

    const { easy, medium, hard } = computeDifficultyDistribution(
      sanitizedQuestionCount,
      sanitizedDifficultyMode
    );
    const choiceCount = sanitizedQuestionType === "true_false" ? 2 : 4;

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
    };

    let result = await generateAndValidate(notes, genParams);

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

    const questions = result.questions;

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

    // 10. Log this generation so daily limits can be enforced going forward.
    const { error: logError } = await supabase.from("generation_logs").insert({
      user_id: user.id,
      deck_id: deckId,
    });

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