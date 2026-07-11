import { NextRequest, NextResponse } from "next/server";
import type { MistakeType } from "@/lib/mistakeBreakdown";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

type MistakeBreakdownRecord = {
  questionId: string;
  topic: string;
  selectedAnswer: string;
  correctAnswer: string;
  temptingButWrongReason: string;
  correctWhyReason: string;
  misunderstoodConcept: string;
  simplerExplanation: string;
  memoryTrick: string;
  miniFollowUpQuestion: string;
  confidenceRating: MistakeType;
  confidenceReason?: string;
  conceptKey?: string;
  mistakePatternKey?: string;
  rematchMode?: string;
  responseTimeMs: number;
  difficulty: string;
};

type SavePayload = {
  deckId?: string;
  matchId?: string;
  playerName?: string;
  records?: MistakeBreakdownRecord[];
};

const supabase = getServiceSupabaseClient();

async function resolvePlayerIdentity(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  const displayName =
    typeof data?.display_name === "string" ? data.display_name.trim() : "";

  return displayName || null;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error.";
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isValidRating(value: unknown): value is MistakeType {
  return (
    value === "careless_mistake" ||
    value === "careless_error" ||
    value === "concept_gap" ||
    value === "slow_response" ||
    value === "speed_trap" ||
    value === "misread_question" ||
    value === "repeated_weakness" ||
    value === "almost_mastered" ||
    value === "guessing_pattern"
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deckId = req.nextUrl.searchParams.get("deckId") || "";
    const playerName = await resolvePlayerIdentity(auth.userId);

    if (!deckId || !playerName) {
      return NextResponse.json(
        {
          topicMisses: {},
          selectedOptionRepeats: {},
          conceptMisses: {},
          confidenceMisses: {},
        },
        { status: 200 }
      );
    }

    const { data, error } = await supabase
      .from("mistake_breakdowns")
      .select("topic, question_id, selected_answer, misunderstood_concept, confidence_rating")
      .eq("deck_id", deckId)
      .eq("player_name", playerName)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json(
        {
          topicMisses: {},
          selectedOptionRepeats: {},
          conceptMisses: {},
          confidenceMisses: {},
          warning: error.message,
        },
        { status: 200 }
      );
    }

    const topicMisses: Record<string, number> = {};
    const selectedOptionRepeats: Record<string, number> = {};
    const conceptMisses: Record<string, number> = {};
    const confidenceMisses: Partial<Record<MistakeType, number>> = {};

    for (const row of data || []) {
      const topicKey = normalizeKey(String(row.topic || "General"));
      topicMisses[topicKey] = (topicMisses[topicKey] || 0) + 1;

      const pairKey = `${String(row.question_id || "")}::${String(
        row.selected_answer || ""
      )}`.toLowerCase();
      selectedOptionRepeats[pairKey] = (selectedOptionRepeats[pairKey] || 0) + 1;

      const conceptKey = normalizeKey(String(row.misunderstood_concept || "General core rule"));
      conceptMisses[conceptKey] = (conceptMisses[conceptKey] || 0) + 1;

      const rating = String(row.confidence_rating || "") as MistakeType;
      if (isValidRating(rating)) {
        confidenceMisses[rating] = (confidenceMisses[rating] || 0) + 1;
      }
    }

    return NextResponse.json({
      topicMisses,
      selectedOptionRepeats,
      conceptMisses,
      confidenceMisses,
    });
  } catch (error) {
    return NextResponse.json(
      {
        topicMisses: {},
        selectedOptionRepeats: {},
        conceptMisses: {},
        confidenceMisses: {},
        warning: getErrorMessage(error),
      },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SavePayload;
    const deckId = String(body.deckId || "").trim();
    const matchId = String(body.matchId || "").trim();
    const playerName = await resolvePlayerIdentity(auth.userId);
    const records = ensureArray<MistakeBreakdownRecord>(body.records);

    if (!deckId || !matchId || !playerName || records.length === 0) {
      return NextResponse.json(
        { error: "Missing required mistake breakdown payload." },
        { status: 400 }
      );
    }

    const uniqueQuestionIds = Array.from(
      new Set(
        records
          .map((record) => String(record.questionId || "").trim())
          .filter(Boolean)
      )
    );

    if (uniqueQuestionIds.length === 0) {
      return NextResponse.json(
        { error: "No valid question IDs were supplied." },
        { status: 400 }
      );
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("mistake_breakdowns")
      .select("question_id")
      .eq("match_id", matchId)
      .in("question_id", uniqueQuestionIds);

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    const existingIds = new Set((existingRows || []).map((row) => row.question_id));

    const rowsToInsert = records
      .filter((record) => {
        const questionId = String(record.questionId || "").trim();
        return questionId && !existingIds.has(questionId);
      })
      .map((record) => {
        const rating = isValidRating(record.confidenceRating)
          ? record.confidenceRating
          : "concept_gap";

        return {
          match_id: matchId,
          deck_id: deckId,
          question_id: String(record.questionId || "").trim(),
          player_name: playerName,
          topic: String(record.topic || "General").trim() || "General",
          selected_answer: String(record.selectedAnswer || "").trim(),
          correct_answer: String(record.correctAnswer || "").trim(),
          tempting_but_wrong_reason: String(record.temptingButWrongReason || "").trim(),
          correct_why_reason: String(record.correctWhyReason || "").trim(),
          misunderstood_concept: String(record.misunderstoodConcept || "").trim(),
          simpler_explanation: String(record.simplerExplanation || "").trim(),
          memory_trick: String(record.memoryTrick || "").trim(),
          mini_follow_up_question: String(record.miniFollowUpQuestion || "").trim(),
          confidence_rating: rating,
          confidence_reason: String(record.confidenceReason || "").trim(),
          concept_key:
            String(record.conceptKey || "")
              .toLowerCase()
              .replace(/[^a-z0-9\s:]/g, " ")
              .replace(/\s+/g, " ")
              .trim() || null,
          mistake_pattern_key:
            String(record.mistakePatternKey || "")
              .toLowerCase()
              .replace(/[^a-z0-9\s:_-]/g, " ")
              .replace(/\s+/g, " ")
              .trim() || null,
          rematch_mode: String(record.rematchMode || "practice").trim().toLowerCase() || "practice",
          response_time_ms: Number.isFinite(record.responseTimeMs)
            ? Math.max(0, Math.round(record.responseTimeMs))
            : 0,
          difficulty: String(record.difficulty || "medium").trim().toLowerCase() || "medium",
        };
      });

    if (rowsToInsert.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: records.length });
    }

    let insertError: { message: string } | null = null;

    const primaryInsert = await supabase
      .from("mistake_breakdowns")
      .insert(rowsToInsert);

    if (primaryInsert.error) {
      const message = primaryInsert.error.message || "";
      const isSchemaMismatch =
        /column\s+.*does not exist/i.test(message) ||
        /schema cache/i.test(message);

      if (!isSchemaMismatch) {
        insertError = primaryInsert.error;
      } else {
        const legacyRows = rowsToInsert.map((row) => ({
          match_id: row.match_id,
          deck_id: row.deck_id,
          question_id: row.question_id,
          player_name: row.player_name,
          topic: row.topic,
          selected_answer: row.selected_answer,
          correct_answer: row.correct_answer,
          tempting_but_wrong_reason: row.tempting_but_wrong_reason,
          correct_why_reason: row.correct_why_reason,
          misunderstood_concept: row.misunderstood_concept,
          simpler_explanation: row.simpler_explanation,
          memory_trick: row.memory_trick,
          mini_follow_up_question: row.mini_follow_up_question,
          confidence_rating: row.confidence_rating,
          response_time_ms: row.response_time_ms,
          difficulty: row.difficulty,
        }));

        const fallbackInsert = await supabase
          .from("mistake_breakdowns")
          .insert(legacyRows);

        if (fallbackInsert.error) {
          insertError = fallbackInsert.error;
        }
      }
    }

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: rowsToInsert.length, skipped: records.length - rowsToInsert.length });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
