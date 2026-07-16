import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

// Cross-deck counterpart to the Mastery Map's per-deck weak-topic rematch
// links (buildWeakTopicHref in app/mastery-map/page.tsx). Reads the same
// topic_review_schedule rows battle/finish already writes on every
// completed battle (updateTopicReviewSchedule in
// app/api/battle/finish/route.ts) instead of recomputing weakness from
// scratch, so this agrees with what the Mastery Map and the reminder cron
// already tell the student -- just widened from "this one deck" to "every
// deck this student has".

export const runtime = "nodejs";

const MAX_DECKS_RETURNED = 4;
const MAX_TOPICS_PER_DECK = 4;

type TopicReviewRow = {
  deck_id: string;
  topic: string;
  status: string;
  correct_count: number | null;
  total_count: number | null;
};

type BlindspotDeck = {
  deckId: string;
  deckTitle: string;
  topics: string[];
  accuracy: number;
};

export async function GET(req: NextRequest) {
  try {
    const { userId, errorResponse } = await requireAuthenticatedUser(req);
    if (!userId) {
      return NextResponse.json(
        { error: errorResponse || "Sign in to see blindspots across all your decks." },
        { status: 401 }
      );
    }

    const rateLimit = await checkDistributedRateLimit({
      key: `blindspot-quiz:${userId}`,
      limit: 20,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const supabase = getServiceSupabaseClient();

    const { data: deckRows, error: deckError } = await supabase
      .from("decks")
      .select("id, title")
      .eq("user_id", userId);

    if (deckError) {
      return NextResponse.json({ error: "Could not load your decks right now." }, { status: 500 });
    }

    const decks = deckRows || [];
    if (decks.length === 0) {
      return NextResponse.json({
        decks: [],
        message: "Play at least one battle first so VYRA has mistakes to learn from.",
      });
    }

    const deckIds = decks.map((d) => d.id as string);
    const deckTitleById = new Map(decks.map((d) => [d.id as string, (d.title as string) || "Deck"]));

    const { data: topicRows, error: topicError } = await supabase
      .from("topic_review_schedule")
      .select("deck_id, topic, status, correct_count, total_count")
      .eq("user_id", userId)
      .in("deck_id", deckIds)
      .in("status", ["weak", "improving"]);

    if (topicError) {
      // Table may not be deployed yet -- treat as "no blindspots found"
      // rather than failing the whole feature.
      return NextResponse.json({ decks: [] });
    }

    const rows = (topicRows || []) as TopicReviewRow[];
    if (rows.length === 0) {
      return NextResponse.json({
        decks: [],
        message: "No weak topics found yet -- keep battling and VYRA will start spotting patterns.",
      });
    }

    const ranked = rows.map((row) => {
      const total = row.total_count || 0;
      const correct = row.correct_count || 0;
      return {
        deckId: row.deck_id,
        topic: row.topic,
        status: row.status,
        accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      };
    });

    // Weak topics first, then worst accuracy first, within each status tier.
    ranked.sort((a, b) => {
      if (a.status !== b.status) return a.status === "weak" ? -1 : 1;
      return a.accuracy - b.accuracy;
    });

    const byDeck = new Map<string, { topics: string[]; accuracySum: number; count: number }>();
    for (const row of ranked) {
      const entry = byDeck.get(row.deckId) || { topics: [], accuracySum: 0, count: 0 };
      if (entry.topics.length < MAX_TOPICS_PER_DECK) entry.topics.push(row.topic);
      entry.accuracySum += row.accuracy;
      entry.count += 1;
      byDeck.set(row.deckId, entry);
    }

    const blindspotDecks: BlindspotDeck[] = Array.from(byDeck.entries())
      .map(([deckId, entry]) => ({
        deckId,
        deckTitle: deckTitleById.get(deckId) || "Deck",
        topics: entry.topics,
        accuracy: Math.round(entry.accuracySum / entry.count),
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, MAX_DECKS_RETURNED);

    return NextResponse.json({ decks: blindspotDecks });
  } catch (err) {
    console.error("Failed to compute blindspots:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not compute blindspots right now." }, { status: 500 });
  }
}
