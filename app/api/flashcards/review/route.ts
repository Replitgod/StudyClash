import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import { NEW_CARD_STATE, ratingIsRecall, reviewCard, type Rating } from "@/lib/flashcards";
import { recordTopicEvidence } from "@/lib/server/studyEvidence";

export const runtime = "nodejs";

// POST /api/flashcards/review { cardId, rating }
//
// One flashcard rating. Schedules the card's next review for this student,
// and counts toward the topic's mastery -- flipping a card and recalling the
// answer is retrieval practice, and until now the app threw the evidence
// away (ratings lived in localStorage and nothing else ever read them).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATINGS: ReadonlySet<string> = new Set(["again", "hard", "good", "easy"]);

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.userId) {
    return NextResponse.json({ error: "Please log in to save your progress." }, { status: 401 });
  }

  const limit = await checkDistributedRateLimit({
    key: `flashcard-review:${auth.userId}`,
    limit: 240,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Slow down a little and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  const rating = typeof body?.rating === "string" ? body.rating : "";
  if (!UUID_RE.test(cardId) || !RATINGS.has(rating)) {
    return NextResponse.json({ error: "That review couldn't be read." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: card } = await supabase
    .from("flashcards")
    .select("id, deck_id, topic")
    .eq("id", cardId)
    .maybeSingle();
  if (!card) {
    return NextResponse.json({ error: "That card no longer exists." }, { status: 404 });
  }

  // Only the owner's own set: review state is per student, and a card from
  // someone else's deck is not something this student is studying.
  const { data: deck } = await supabase
    .from("decks")
    .select("user_id")
    .eq("id", card.deck_id)
    .maybeSingle();
  if (!deck || deck.user_id !== auth.userId) {
    return NextResponse.json({ error: "That card no longer exists." }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("flashcard_state")
    .select("ease, interval_days, repetitions, lapses, due_at, last_reviewed_at")
    .eq("user_id", auth.userId)
    .eq("flashcard_id", cardId)
    .maybeSingle();

  const now = Date.now();
  const next = reviewCard(
    existing
      ? {
          ease: Number(existing.ease),
          intervalDays: Number(existing.interval_days),
          repetitions: existing.repetitions,
          lapses: existing.lapses,
          dueAt: existing.due_at,
          lastReviewedAt: existing.last_reviewed_at,
        }
      : NEW_CARD_STATE,
    rating as Rating,
    now
  );

  const { error: saveError } = await supabase.from("flashcard_state").upsert(
    {
      user_id: auth.userId,
      flashcard_id: cardId,
      deck_id: card.deck_id,
      ease: next.ease,
      interval_days: next.intervalDays,
      repetitions: next.repetitions,
      lapses: next.lapses,
      last_rating: rating,
      due_at: next.dueAt,
      last_reviewed_at: next.lastReviewedAt,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "user_id,flashcard_id" }
  );

  if (saveError) {
    console.error("Saving a flashcard review failed:", saveError.message);
    return NextResponse.json({ error: "That rating didn't save. Try again." }, { status: 500 });
  }

  // Mastery. Best-effort: the card's own schedule is already saved.
  try {
    await recordTopicEvidence(supabase, {
      owner: { userId: auth.userId, playerName: "" },
      deckId: card.deck_id,
      perTopic: new Map([
        [
          card.topic || "General",
          {
            correct: ratingIsRecall(rating as Rating) ? 1 : 0,
            total: 1,
            recoveries: 0,
            confidentMisses: 0,
          },
        ],
      ]),
      // A card reviewed minutes after the last one is the same sitting, not
      // another spaced repetition.
      session: "auto",
      now,
    });
  } catch (error) {
    console.error(
      "Crediting a flashcard review to mastery failed:",
      error instanceof Error ? error.message : error
    );
  }

  return NextResponse.json({ state: next });
}
