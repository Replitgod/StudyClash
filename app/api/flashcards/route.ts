import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import { writeFlashcards, notesFromQuestions } from "@/lib/server/flashcardWriter";
import { cardsFromImportedQuestions, flashcardTarget, type FlashcardDraft } from "@/lib/flashcards";
import { resolveTier } from "@/lib/tiers";
import { tierIdForPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/flashcards?deckId=...
//
// A study set's cards, with this student's review state for each.
//
// Sets created before real flashcards existed have none. The first time
// their Flashcards tab opens, cards are written here -- recovered directly
// from the original terms for Quizlet and Anki imports, or written by the
// model from the set's notes (or, with no notes, from its questions) -- and
// saved, so it only happens once.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_NOTES_WORDS = 30;

type CardRow = {
  id: string;
  front: string;
  back: string;
  note: string | null;
  topic: string;
  kind: string;
  position: number;
};

type StateRow = {
  flashcard_id: string;
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_at: string | null;
  last_reviewed_at: string | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.userId) {
    return NextResponse.json({ error: "Please log in to see your flashcards." }, { status: 401 });
  }

  const deckId = req.nextUrl.searchParams.get("deckId") || "";
  if (!UUID_RE.test(deckId)) {
    return NextResponse.json({ error: "That study set wasn't found." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: deck } = await supabase
    .from("decks")
    .select("id, user_id, raw_notes")
    .eq("id", deckId)
    .maybeSingle();

  if (!deck || deck.user_id !== auth.userId) {
    return NextResponse.json({ error: "That study set wasn't found." }, { status: 404 });
  }

  const cardsResult = await supabase
    .from("flashcards")
    .select("id, front, back, note, topic, kind, position")
    .eq("deck_id", deckId)
    .order("position", { ascending: true });

  if (cardsResult.error) {
    // The flashcards table is not deployed yet (20260918_02). Say so
    // plainly; the client falls back to showing nothing rather than the old
    // question-as-card view.
    console.error("Reading flashcards failed:", cardsResult.error.message);
    return NextResponse.json(
      { error: "Flashcards aren't available yet. Please try again later." },
      { status: 503 }
    );
  }

  let cards = (cardsResult.data || []) as CardRow[];
  let generated = false;

  if (cards.length === 0) {
    const limit = await checkDistributedRateLimit({
      key: `flashcards-generate:${auth.userId}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "You've made a lot of flashcard sets this hour. Try again a little later." },
        { status: 429 }
      );
    }

    const drafts = await writeCardsForDeck(deckId, auth.userId, String(deck.raw_notes || ""));
    if (drafts.length > 0) {
      const { data: inserted, error } = await supabase
        .from("flashcards")
        .insert(
          drafts.map((card, position) => ({
            deck_id: deckId,
            front: card.front,
            back: card.back,
            note: card.note,
            topic: card.topic,
            kind: card.kind,
            position,
          }))
        )
        .select("id, front, back, note, topic, kind, position");
      if (error?.code === "23505") {
        // Another request wrote this deck's cards first. Use those.
        const { data: winner } = await supabase
          .from("flashcards")
          .select("id, front, back, note, topic, kind, position")
          .eq("deck_id", deckId)
          .order("position", { ascending: true });
        cards = (winner || []) as CardRow[];
      } else if (error) {
        console.error("Saving generated flashcards failed:", error.message);
      } else {
        cards = (inserted || []) as CardRow[];
        generated = true;
      }
    }
  }

  const { data: states } = await supabase
    .from("flashcard_state")
    .select("flashcard_id, ease, interval_days, repetitions, lapses, due_at, last_reviewed_at")
    .eq("user_id", auth.userId)
    .eq("deck_id", deckId);

  const stateById = new Map(((states || []) as StateRow[]).map((row) => [row.flashcard_id, row]));

  return NextResponse.json(
    {
      generated,
      cards: cards.map((card) => {
        const state = stateById.get(card.id);
        return {
          ...card,
          state: state
            ? {
                ease: Number(state.ease),
                intervalDays: Number(state.interval_days),
                repetitions: state.repetitions,
                lapses: state.lapses,
                dueAt: state.due_at,
                lastReviewedAt: state.last_reviewed_at,
              }
            : null,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function writeCardsForDeck(
  deckId: string,
  userId: string,
  rawNotes: string
): Promise<FlashcardDraft[]> {
  const supabase = getServiceSupabaseClient();

  const [{ data: questions }, { data: profile }] = await Promise.all([
    supabase
      .from("questions")
      .select("question_text, correct_answer, explanation, topic, question_type")
      .eq("deck_id", deckId)
      .limit(60),
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
  ]);

  const rows = (questions || []) as Array<{
    question_text: string;
    correct_answer: string;
    explanation: string | null;
    topic: string | null;
    question_type: string | null;
  }>;

  // An import already contains the student's own cards.
  const imported = cardsFromImportedQuestions(rows);
  if (imported.length >= Math.max(3, Math.floor(rows.length * 0.6))) {
    return imported;
  }

  if (!process.env.OPENAI_API_KEY) return [];

  const notes =
    rawNotes.trim().split(/\s+/).length >= MIN_NOTES_WORDS
      ? rawNotes.slice(0, 60_000)
      : notesFromQuestions(rows.filter((q) => q.question_type !== "open_response"));
  if (!notes.trim()) return [];

  const tier = resolveTier(tierIdForPlan((profile as { plan?: string } | null)?.plan));
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { cards } = await writeFlashcards(openai, {
    notes,
    count: flashcardTarget(rows.length || 10),
    perTopicCap: tier.cardsPerConceptCap,
  });
  return cards;
}
