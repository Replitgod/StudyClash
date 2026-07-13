import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

// Reads question_review_schedule (app/api/battle/finish/route.ts writes it)
// to answer "which exact questions in this deck is this student currently
// missing or due to review" -- the per-question counterpart to
// topic_review_schedule's topic-level view. Used by the Mastery Map to
// build precise rematch links (app/mastery-map/page.tsx) instead of
// falling back to "anything tagged with this topic label."

type DueRow = {
  question_id: string;
  status: string;
};

type QuestionTopicRow = {
  id: string;
  topic: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { userId, errorResponse } = await requireAuthenticatedUser(req);
    if (!userId) {
      return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkDistributedRateLimit({
      key: `due-questions:${userId}`,
      limit: 30,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const deckId = req.nextUrl.searchParams.get("deckId");
    if (!deckId) {
      return NextResponse.json({ error: "deckId is required." }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const nowIso = new Date().toISOString();

    const { data: dueRows, error } = await supabase
      .from("question_review_schedule")
      .select("question_id, status")
      .eq("deck_id", deckId)
      .eq("user_id", userId)
      .or(`status.eq.weak,next_review_at.lte.${nowIso}`);

    if (error) {
      // Table may not be deployed yet -- treat as "nothing due" rather than
      // failing the whole Mastery Map page.
      return NextResponse.json({ items: [], dueCount: 0 });
    }

    const rows = (dueRows || []) as DueRow[];
    if (rows.length === 0) {
      return NextResponse.json({ items: [], dueCount: 0 });
    }

    const questionIds = rows.map((row) => row.question_id);
    const { data: questionRows } = await supabase
      .from("questions")
      .select("id, topic")
      .in("id", questionIds);

    const topicById = new Map(
      ((questionRows || []) as QuestionTopicRow[]).map((row) => [row.id, row.topic || "General"])
    );

    const items = rows
      .map((row) => ({
        questionId: row.question_id,
        topic: topicById.get(row.question_id) || "General",
        status: row.status,
      }))
      // Weakest first, then whatever order the schedule returned.
      .sort((a, b) => (a.status === "weak" ? -1 : 0) - (b.status === "weak" ? -1 : 0));

    return NextResponse.json({ items, dueCount: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load due questions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
