import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

type AnswerPayload = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
};

type FinishBattlePayload = {
  deckId: string;
  playerName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeTakenSeconds: number;
  answers: AnswerPayload[];
};

function isValidAnswerPayload(value: unknown): value is AnswerPayload {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.questionId === "string" &&
    typeof candidate.selectedAnswer === "string" &&
    typeof candidate.isCorrect === "boolean" &&
    typeof candidate.responseTimeMs === "number"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<FinishBattlePayload>;

    if (
      !body.deckId ||
      !body.playerName ||
      typeof body.score !== "number" ||
      typeof body.totalQuestions !== "number" ||
      typeof body.correctAnswers !== "number" ||
      typeof body.timeTakenSeconds !== "number" ||
      !Array.isArray(body.answers)
    ) {
      return NextResponse.json(
        { error: "Missing required battle results." },
        { status: 400 }
      );
    }

    if (!body.answers.every(isValidAnswerPayload)) {
      return NextResponse.json(
        { error: "Battle answers were not valid." },
        { status: 400 }
      );
    }

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .insert({
        deck_id: body.deckId,
        player_name: body.playerName,
        score: body.score,
        total_questions: body.totalQuestions,
        correct_answers: body.correctAnswers,
        time_taken_seconds: body.timeTakenSeconds,
      })
      .select("id")
      .single();

    if (matchError || !matchData) {
      return NextResponse.json(
        { error: matchError?.message || "Failed to save your match." },
        { status: 500 }
      );
    }

    if (body.answers.length > 0) {
      const answerRows = body.answers.map((answer) => ({
        match_id: matchData.id,
        question_id: answer.questionId,
        selected_answer: answer.selectedAnswer,
        is_correct: answer.isCorrect,
        response_time_ms: answer.responseTimeMs,
      }));

      const { error: answersError } = await supabase
        .from("match_answers")
        .insert(answerRows);

      if (answersError) {
        return NextResponse.json(
          { error: answersError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ matchId: matchData.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to finish battle.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}