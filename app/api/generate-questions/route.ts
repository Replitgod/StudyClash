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

const REQUIRED_TOTAL = 15;
const MIN_QUESTIONS = 8;
const MIN_NOTES_WORD_COUNT = 30;

function buildPrompt(notes: string): string {
  return `
You are a quiz generator for a study app called StudyClash.

Read the notes below and create between ${MIN_QUESTIONS} and ${REQUIRED_TOTAL} multiple-choice questions
that test understanding of the material. Every question must be answerable
using ONLY the information in the notes below. Do not introduce outside facts,
and do not invent details that are not present in the notes.

Rules for every question:
- "question_text": a clear question based directly on the notes
- "answer_choices": an array of EXACTLY 4 short, realistic, plausible answer strings. Wrong choices should be believable, not silly or obviously wrong.
- "correct_answer": must be an EXACT character-for-character match to one of the 4 strings in "answer_choices"
- "explanation": 1-2 short sentences explaining why the correct answer is right
- "topic": a short label (2-4 words) for the subtopic this question covers
- "difficulty": exactly one of "easy", "medium", or "hard"

Other rules:
- No two questions may test the exact same fact or be reworded duplicates of each other.
- Every question must be unique in what it tests.
- If the notes do not contain enough distinct material to support ${REQUIRED_TOTAL} unique questions, create as many strong questions as you can while keeping them non-overlapping and directly grounded in the notes.
- Prioritize clarity and detail over forcing a large number of questions.

Return ONLY valid JSON in this exact shape, with no extra text, no markdown, no code fences:
{
  "questions": [
    {
      "question_text": "...",
      "answer_choices": ["...", "...", "...", "..."],
      "correct_answer": "...",
      "explanation": "...",
      "topic": "...",
      "difficulty": "..."
    }
  ]
}

Notes:
"""
${notes}
"""
`;
}

// Checks the raw notes before we even call the AI. Cheap, fast guard
// against wasting an API call on notes that can't realistically support
// 15 unique, meaningful questions.
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

// Validates the AI's parsed output. Returns null if valid, or a string
// describing exactly what's wrong if not.
function validateQuestions(questions: unknown): string | null {
  if (!Array.isArray(questions)) {
    return "AI response was not a list of questions.";
  }

  if (questions.length < MIN_QUESTIONS || questions.length > REQUIRED_TOTAL) {
    return `Expected between ${MIN_QUESTIONS} and ${REQUIRED_TOTAL} questions, got ${questions.length}.`;
  }

  const seenQuestionTexts = new Set<string>();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Partial<GeneratedQuestion>;
    const label = `Question ${i + 1}`;

    if (!q || typeof q !== "object") {
      return `${label} is not a valid object.`;
    }

    if (!q.question_text || typeof q.question_text !== "string" || !q.question_text.trim()) {
      return `${label} is missing question_text.`;
    }

    if (!Array.isArray(q.answer_choices) || q.answer_choices.length !== 4) {
      return `${label} must have exactly 4 answer_choices.`;
    }

    const cleanedChoices = q.answer_choices.map((c) =>
      typeof c === "string" ? c.trim() : ""
    );

    if (cleanedChoices.some((c) => !c)) {
      return `${label} has an empty answer choice.`;
    }

    const uniqueChoices = new Set(cleanedChoices.map((c) => c.toLowerCase()));
    if (uniqueChoices.size !== 4) {
      return `${label} has duplicate answer choices.`;
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

    const normalizedText = q.question_text.trim().toLowerCase();
    if (seenQuestionTexts.has(normalizedText)) {
      return `Duplicate question detected: "${q.question_text.trim()}"`;
    }
    seenQuestionTexts.add(normalizedText);
  }

  return null;
}

// Calls OpenAI once and returns either the validated questions or an
// error describing what went wrong (parsing failure or validation failure).
async function generateAndValidate(
  notes: string
): Promise<{ questions: GeneratedQuestion[] } | { error: string }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildPrompt(notes) }],
    response_format: { type: "json_object" },
    temperature: 0.5,
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

  const validationError = validateQuestions(parsed.questions);
  if (validationError) {
    return { error: validationError };
  }

  return { questions: parsed.questions as GeneratedQuestion[] };
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
    const { studentName, courseName, deckTitle, notes, betaAccessCode } = body;

    if (!studentName || !courseName || !deckTitle || !notes) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const expectedBetaAccessCode = process.env.NEXT_PUBLIC_BETA_ACCESS_CODE || process.env.BETA_ACCESS_CODE;
    if (expectedBetaAccessCode) {
      const trimmedProvidedCode = typeof betaAccessCode === "string" ? betaAccessCode.trim() : "";
      if (!trimmedProvidedCode || trimmedProvidedCode !== expectedBetaAccessCode) {
        return NextResponse.json(
          { error: "Please enter a valid beta access code to generate a deck." },
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

    // 6. Validate the notes themselves before spending an AI call on them
    const notesError = validateNotes(notes);
    if (notesError) {
      return NextResponse.json({ error: notesError }, { status: 400 });
    }

    // 7. Generate + validate. If the first attempt fails validation
    // (malformed JSON, wrong count, mismatched correct_answer, wrong
    // difficulty mix, duplicates, etc.), retry exactly once before
    // giving up with a clean error.
    let result = await generateAndValidate(notes);

    if ("error" in result) {
      result = await generateAndValidate(notes);
    }

    if ("error" in result) {
      return NextResponse.json(
        {
          error:
            "We couldn't generate a good quiz from these notes. Try adding more detail or clarity to your notes and try again.",
        },
        { status: 422 }
      );
    }

    const questions = result.questions;

    // 8. Save the deck first, so we get a deck_id to attach questions to.
    // Linked to the logged-in user via user_id.
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
    // This is intentionally not a hard-fail: the deck was already created
    // successfully, and we don't want a logging hiccup to make the user
    // think their deck generation failed when it actually succeeded.
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