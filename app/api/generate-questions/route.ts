import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// This client uses the SERVICE ROLE key, which is safe here because
// this code only ever runs on the server (inside this API route).
// Never send the service role key to the browser.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
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

export async function POST(req: NextRequest) {
  try {
    // 1. Read the data sent from the frontend form
    const body = await req.json();
    const { studentName, courseName, deckTitle, notes } = body;

    if (!studentName || !courseName || !deckTitle || !notes) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // 2. Ask OpenAI to turn the notes into 15 multiple-choice questions.
    // We ask for strict JSON so it's easy to parse safely.
    const prompt = `
You are a quiz generator for a study app called StudyClash.

Read the notes below and create exactly 15 multiple-choice questions
that test understanding of the material.

Rules for every question:
- "question_text": a clear question based on the notes
- "answer_choices": an array of exactly 4 short answer strings
- "correct_answer": must exactly match one of the 4 answer_choices
- "explanation": 1-2 sentences explaining why the correct answer is right
- "topic": a short label for the subtopic this question covers
- "difficulty": one of "easy", "medium", or "hard"

Return ONLY valid JSON in this exact shape, with no extra text:
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    const rawContent = completion.choices[0]?.message?.content;

    if (!rawContent) {
      return NextResponse.json(
        { error: "OpenAI did not return any content." },
        { status: 500 }
      );
    }

    // 3. Parse the AI's JSON response
    let parsed: { questions: GeneratedQuestion[] };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response as JSON." },
        { status: 500 }
      );
    }

    const questions = parsed.questions;

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { error: "AI response did not include a valid questions array." },
        { status: 500 }
      );
    }

    // 4. Save the deck first, so we get a deck_id to attach questions to
    const { data: deckData, error: deckError } = await supabase
      .from("decks")
      .insert({
        student_name: studentName,
        course_name: courseName,
        title: deckTitle,
        raw_notes: notes,
      })
      .select()
      .single();

    if (deckError) {
      return NextResponse.json({ error: deckError.message }, { status: 500 });
    }

    const deckId = deckData.id;

    // 5. Prepare the questions for insertion, linking each to the deck
    const questionsToInsert = questions.map((q) => ({
      deck_id: deckId,
      question_text: q.question_text,
      answer_choices: q.answer_choices,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      topic: q.topic,
      difficulty: q.difficulty,
    }));

    const { error: questionsError } = await supabase
      .from("questions")
      .insert(questionsToInsert);

    if (questionsError) {
      return NextResponse.json(
        { error: questionsError.message },
        { status: 500 }
      );
    }

    // 6. Send the new deck's id back to the frontend
    return NextResponse.json({ deckId });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}