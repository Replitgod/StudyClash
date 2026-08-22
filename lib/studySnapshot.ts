// The single read of "everything AcedIQ knows about what this student is
// studying", shared by Home, Library and Practice.
//
// Those three screens all answer versions of the same question ("what should
// I study next?") off the same three tables. Before this they each ran their
// own queries on mount, so moving between them re-fetched identical rows.
// This loads once, caches the result in module scope, and hands every screen
// the same derived view.

import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { getMasteryTier, type MasteryTier } from "@/lib/masteryTiers";

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
  accuracy: number;
  tier: MasteryTier;
  isDue: boolean;
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
  /** Everything due for review right now, weakest first. */
  dueTopics: TopicSummary[];
  weakTopics: TopicSummary[];
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

  const isDueRow = (row: TopicRow) =>
    row.status === "weak" || Date.parse(row.next_review_at) <= now;

  const deckSummaries: DeckSummary[] = decks.map((deck) => {
    const history = historyByDeck.get(deck.id);
    const deckTopics = topicsByDeck.get(deck.id) || [];

    return {
      id: deck.id,
      title: deck.title,
      course: (deck.course_name || "").trim() || "General",
      createdAt: deck.created_at,
      lastStudiedAt: history?.last || null,
      mastery: history ? pct(history.correct, history.total) : null,
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
      return {
        topic: row.topic,
        deckId: row.deck_id,
        deckTitle: deck.title,
        course: deck.course,
        correct: row.correct_count,
        total: row.total_count,
        accuracy: pct(row.correct_count, row.total_count) ?? 0,
        tier: getMasteryTier(row.correct_count, row.total_count),
        isDue: isDueRow(row),
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
    dueTopics: topicSummaries
      .filter((t) => t.isDue)
      .sort((a, b) => a.accuracy - b.accuracy),
    weakTopics: topicSummaries
      .filter((t) => t.tier === "needs_review" || t.tier === "developing")
      .sort((a, b) => a.accuracy - b.accuracy),
    totalSessions: matches.length,
    overallMastery: pct(totalCorrect, totalAnswered),
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
