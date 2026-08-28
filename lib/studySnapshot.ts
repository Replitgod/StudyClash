// The single read of "everything AceDecks knows about what this student is
// studying", shared by Home, Library and Practice.
//
// Those three screens all answer versions of the same question ("what should
// I study next?") off the same three tables. Before this they each ran their
// own queries on mount, so moving between them re-fetched identical rows.
// This loads once, caches the result in module scope, and hands every screen
// the same derived view.

import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { type MasteryTier } from "@/lib/masteryTiers";
import { computeMastery, opportunityScore, type MasteryState } from "@/lib/mastery";

export type DeckRow = {
  id: string;
  title: string;
  course_name: string;
  student_name: string | null;
  created_at: string;
};

export type MatchRow = {
  deck_id: string | null;
  correct_answers: number | null;
  total_questions: number | null;
  created_at: string;
};

export type TopicRow = {
  deck_id: string;
  topic: string;
  status: string;
  correct_count: number;
  total_count: number;
  next_review_at: string;
  /** Sessions that have touched this topic. Drives stability in the model. */
  attempts?: number | null;
  last_practiced_at?: string | null;
  /** Missed-then-recovered questions. Counts as extra spaced repetitions. */
  recoveries?: number | null;
};

export type DeckSummary = {
  id: string;
  title: string;
  course: string;
  createdAt: string;
  /** Last time the student actually practised this deck, if ever. */
  lastStudiedAt: string | null;
  /** 0-100. Null until the deck has been practised at least once. */
  mastery: number | null;
  /** Topics in this deck that are weak or due for review right now. */
  dueTopics: string[];
  weakTopics: string[];
};

export type TopicSummary = {
  topic: string;
  deckId: string;
  deckTitle: string;
  course: string;
  correct: number;
  total: number;
  /** Raw lifetime accuracy. Kept for display; not what ranking reads. */
  accuracy: number;
  /** 0-100 from the mastery engine: recency, decay and evidence included. */
  mastery: number;
  /** The full modelled state, for screens that explain the number. */
  state: MasteryState;
  tier: MasteryTier;
  isDue: boolean;
  /** Known once, slipping now. The cheapest thing in the app to save. */
  isFading: boolean;
  /** How urgent it is to fix this, relative to every other topic. */
  priority: number;
};

export type CourseSummary = {
  name: string;
  decks: DeckSummary[];
  mastery: number | null;
};

export type StudySnapshot = {
  decks: DeckSummary[];
  topics: TopicSummary[];
  courses: CourseSummary[];
  /** Everything due for review right now, most worth fixing first. */
  dueTopics: TopicSummary[];
  weakTopics: TopicSummary[];
  /** Topics being actively forgotten. Cheap to save, expensive to lose. */
  fadingTopics: TopicSummary[];
  totalSessions: number;
  overallMastery: number | null;
  /** True when the student has never created a deck. */
  isEmpty: boolean;
};

export const EMPTY_SNAPSHOT: StudySnapshot = {
  decks: [],
  topics: [],
  courses: [],
  dueTopics: [],
  weakTopics: [],
  fadingTopics: [],
  totalSessions: 0,
  overallMastery: null,
  isEmpty: true,
};

function pct(correct: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 100);
}

export function buildSnapshot(args: {
  decks: DeckRow[];
  matches: MatchRow[];
  topics: TopicRow[];
  now?: number;
}): StudySnapshot {
  const { decks, matches, topics } = args;
  const now = args.now ?? Date.now();

  // --- Per-deck practice history -----------------------------------------
  const historyByDeck = new Map<
    string,
    { correct: number; total: number; last: string | null }
  >();

  for (const match of matches) {
    if (!match.deck_id) continue;
    const entry = historyByDeck.get(match.deck_id) || {
      correct: 0,
      total: 0,
      last: null,
    };
    entry.correct += match.correct_answers || 0;
    entry.total += match.total_questions || 0;
    if (!entry.last || match.created_at > entry.last) entry.last = match.created_at;
    historyByDeck.set(match.deck_id, entry);
  }

  // --- Per-deck topic state ----------------------------------------------
  const topicsByDeck = new Map<string, TopicRow[]>();
  for (const topic of topics) {
    const list = topicsByDeck.get(topic.deck_id) || [];
    list.push(topic);
    topicsByDeck.set(topic.deck_id, list);
  }

  // --- The mastery model, once per topic ----------------------------------
  //
  // Everything below reads from these rather than recomputing accuracy in
  // three different places, which is how Home, Library and Practice used to
  // end up quoting three different numbers for the same topic.
  const stateByRow = new Map<TopicRow, MasteryState>();
  for (const row of topics) {
    stateByRow.set(
      row,
      computeMastery({
        correct: row.correct_count,
        total: row.total_count,
        sessions: row.attempts ?? undefined,
        recoveries: row.recoveries ?? undefined,
        lastPracticedMs: row.last_practiced_at
          ? Date.parse(row.last_practiced_at)
          : null,
        now,
      })
    );
  }

  // A topic is due if the server scheduled it due, if it was flagged weak,
  // or if the model says it has decayed past the review threshold. The
  // union matters: the stored `next_review_at` is only recomputed when the
  // student practises, so on its own it cannot notice a topic going stale
  // between sessions -- which is exactly when a reminder is worth most.
  const isDueRow = (row: TopicRow) =>
    row.status === "weak" ||
    Date.parse(row.next_review_at) <= now ||
    (stateByRow.get(row)?.isDue ?? false);

  const deckSummaries: DeckSummary[] = decks.map((deck) => {
    const history = historyByDeck.get(deck.id);
    const deckTopics = topicsByDeck.get(deck.id) || [];

    // Prefer the model when there is per-topic evidence to model from; fall
    // back to raw session accuracy for a deck that has been practised but
    // has no topic rows yet.
    const modelled = deckTopics
      .map((row) => stateByRow.get(row))
      .filter((state): state is MasteryState => Boolean(state));

    const mastery = modelled.length
      ? Math.round(modelled.reduce((sum, s) => sum + s.mastery, 0) / modelled.length)
      : history
        ? pct(history.correct, history.total)
        : null;

    return {
      id: deck.id,
      title: deck.title,
      course: (deck.course_name || "").trim() || "General",
      createdAt: deck.created_at,
      lastStudiedAt: history?.last || null,
      mastery,
      dueTopics: deckTopics.filter(isDueRow).map((t) => t.topic),
      weakTopics: deckTopics.filter((t) => t.status === "weak").map((t) => t.topic),
    };
  });

  // --- Flat topic list ----------------------------------------------------
  const deckById = new Map(deckSummaries.map((d) => [d.id, d]));
  const topicSummaries: TopicSummary[] = topics
    // A topic row whose deck has since been deleted has nothing the student
    // can click through to, so it is dropped rather than shown as a dead end.
    .filter((row) => deckById.has(row.deck_id))
    .map((row) => {
      const deck = deckById.get(row.deck_id) as DeckSummary;
      const state = stateByRow.get(row) as MasteryState;
      return {
        topic: row.topic,
        deckId: row.deck_id,
        deckTitle: deck.title,
        course: deck.course,
        correct: row.correct_count,
        total: row.total_count,
        accuracy: pct(row.correct_count, row.total_count) ?? 0,
        mastery: state.mastery,
        state,
        tier: state.tier,
        isDue: isDueRow(row),
        isFading: state.isFading,
        priority: opportunityScore(state),
      };
    });

  // --- Courses ------------------------------------------------------------
  const byCourse = new Map<string, DeckSummary[]>();
  for (const deck of deckSummaries) {
    const list = byCourse.get(deck.course) || [];
    list.push(deck);
    byCourse.set(deck.course, list);
  }

  const courses: CourseSummary[] = Array.from(byCourse.entries())
    .map(([name, list]) => {
      const scored = list.filter((d) => d.mastery !== null);
      return {
        name,
        mastery: scored.length
          ? Math.round(scored.reduce((sum, d) => sum + (d.mastery || 0), 0) / scored.length)
          : null,
        decks: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalCorrect = matches.reduce((sum, m) => sum + (m.correct_answers || 0), 0);
  const totalAnswered = matches.reduce((sum, m) => sum + (m.total_questions || 0), 0);

  return {
    // Most recently touched first: that is what "Continue studying" means.
    decks: deckSummaries.slice().sort((a, b) => {
      const aTime = a.lastStudiedAt || a.createdAt;
      const bTime = b.lastStudiedAt || b.createdAt;
      return bTime.localeCompare(aTime);
    }),
    topics: topicSummaries,
    courses,
    // Ordered by how much fixing it is actually worth, not simply by the
    // lowest number -- see opportunityScore in lib/mastery.ts.
    dueTopics: topicSummaries
      .filter((t) => t.isDue)
      .sort((a, b) => b.priority - a.priority),
    weakTopics: topicSummaries
      .filter((t) => t.tier === "needs_review" || t.tier === "developing")
      .sort((a, b) => b.priority - a.priority),
    fadingTopics: topicSummaries
      .filter((t) => t.isFading)
      .sort((a, b) => a.state.retrievability - b.state.retrievability),
    totalSessions: matches.length,
    overallMastery: topicSummaries.length
      ? Math.round(
          topicSummaries.reduce((sum, t) => sum + t.mastery, 0) / topicSummaries.length
        )
      : pct(totalCorrect, totalAnswered),
    isEmpty: decks.length === 0,
  };
}

// Far more sessions than a student will realistically accumulate, and
// bounded so this can never become an unbounded query.
const MATCH_LIMIT = 400;

// `topic_review_schedule` is RLS-closed to the browser (service-role only),
// so unlike decks and matches it cannot be queried directly -- a direct
// query returns zero rows with no error, which would silently disable every
// review and weak-topic feature in the app. See
// app/api/study/review-schedule/route.ts.
async function fetchReviewSchedule(): Promise<TopicRow[]> {
  try {
    const response = await authFetch("/api/study/review-schedule");
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.topics) ? (data.topics as TopicRow[]) : [];
  } catch {
    return [];
  }
}

export async function fetchSnapshot(userId: string): Promise<StudySnapshot> {
  const [decksResult, matchesResult, topics] = await Promise.all([
    supabase
      .from("decks")
      .select("id, title, course_name, student_name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("matches")
      .select("deck_id, correct_answers, total_questions, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MATCH_LIMIT),
    fetchReviewSchedule(),
  ]);

  // Any of these can legitimately come back empty (a brand-new account) or
  // error (a table not deployed yet). None of them should be able to blank
  // out the whole screen, so each degrades to "no rows" independently.
  return buildSnapshot({
    decks: (decksResult.data || []) as DeckRow[],
    matches: (matchesResult.data || []) as MatchRow[],
    topics,
  });
}
