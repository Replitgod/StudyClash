// "What should I do next?" -- computed once, in one place.
//
// The old dashboard showed a dozen equally-weighted cards and left the
// student to work this out themselves. AceDecks now answers it: there is
// exactly one recommendation on screen at a time, and this decides what it
// is. Home, Practice and the material workspace all read from here so they
// can never disagree about what the student should do next.

import type { StudySnapshot, TopicSummary } from "@/lib/studySnapshot";

// Every link into a study session goes through here.
//
// The parameter names have to match what the session screen actually parses
// -- `topics` (comma-separated, each individually URI encoded) and `limit`.
// Anything else is silently ignored, which is how a link ends up looking
// like it worked while quietly starting the wrong session.
//
// `mode` is carried through for the older /battle screen, which reads it;
// /study derives what it needs from `topics` and `limit` alone.
export function sessionHref(args: {
  deckId: string;
  topics?: string[];
  mode?: "battle" | "practice" | "weak_topic";
  limit?: number;
}): string {
  const { deckId, topics = [], mode = "battle", limit } = args;
  const params = new URLSearchParams();
  if (mode !== "battle") params.set("mode", mode);
  if (topics.length) params.set("topics", topics.map(encodeURIComponent).join(","));
  if (limit) params.set("limit", String(limit));
  const query = params.toString();
  return query ? `/study/${deckId}?${query}` : `/study/${deckId}`;
}

function topicsInDeck(list: TopicSummary[], deckId: string): string[] {
  return list.filter((t) => t.deckId === deckId).map((t) => t.topic);
}

export type NextAction = {
  /** The button label. Always a verb. */
  label: string;
  /** The one-line reason, written for a student, not a dashboard. */
  reason: string;
  href: string;
  /** Roughly how long it takes, in minutes. */
  minutes: number;
};

// A question takes about 45 seconds with the explanation, so a 15-question
// session lands near 11 minutes. Rounded to something a student can plan
// around rather than a precise-looking fake number.
function minutesFor(questionCount: number): number {
  return Math.max(5, Math.round((questionCount * 45) / 60));
}

export function getNextAction(snapshot: StudySnapshot): NextAction | null {
  if (snapshot.isEmpty) return null;

  // 1. Anything due for review beats anything new. This is the whole point
  //    of tracking mastery.
  const due = snapshot.dueTopics[0];
  if (due) {
    const topics = topicsInDeck(snapshot.dueTopics, due.deckId);
    return {
      label: "Review what you forgot",
      reason:
        topics.length > 1
          ? `${topics.length} topics in ${due.deckTitle} are ready for review`
          : `${due.topic} is ready for review`,
      href: sessionHref({
        deckId: due.deckId,
        topics,
        mode: "weak_topic",
        limit: 10,
      }),
      minutes: minutesFor(10),
    };
  }

  // 2. Otherwise, the weakest thing they have practised.
  const weak = snapshot.weakTopics[0];
  if (weak && weak.total >= 2) {
    return {
      label: "Fix your weak spot",
      reason: `${weak.topic} is at ${weak.accuracy}% — worth another pass`,
      href: sessionHref({
        deckId: weak.deckId,
        topics: [weak.topic],
        mode: "weak_topic",
        limit: 10,
      }),
      minutes: minutesFor(10),
    };
  }

  // 3. Otherwise, anything they have added but never studied.
  const unstudied = snapshot.decks.find((deck) => deck.mastery === null);
  if (unstudied) {
    return {
      label: "Start studying",
      reason: `You have not studied ${unstudied.title} yet`,
      href: sessionHref({ deckId: unstudied.id }),
      minutes: minutesFor(15),
    };
  }

  // 4. Otherwise, keep going on the most recent thing.
  const recent = snapshot.decks[0];
  if (recent) {
    return {
      label: "Keep studying",
      reason:
        recent.mastery !== null
          ? `${recent.title} — ${recent.mastery}% mastered`
          : recent.title,
      href: sessionHref({ deckId: recent.id, mode: "practice" }),
      minutes: minutesFor(15),
    };
  }

  return null;
}

export type PlanItem = {
  id: string;
  title: string;
  detail: string;
  minutes: number;
  href: string;
};

// Today's plan: at most three things, ordered by what actually helps most.
// Deliberately short -- a list long enough to scroll is a list a student
// ignores.
export function getTodaysPlan(snapshot: StudySnapshot): PlanItem[] {
  const items: PlanItem[] = [];
  const usedDecks = new Set<string>();

  for (const topic of snapshot.dueTopics) {
    if (items.length >= 3) break;
    if (usedDecks.has(topic.deckId)) continue;
    usedDecks.add(topic.deckId);
    const deckTopics = topicsInDeck(snapshot.dueTopics, topic.deckId);
    items.push({
      id: `due-${topic.deckId}`,
      title: topic.deckTitle,
      detail:
        deckTopics.length > 1
          ? `${deckTopics.length} topics to review`
          : `Review ${topic.topic}`,
      minutes: minutesFor(10),
      href: sessionHref({
        deckId: topic.deckId,
        topics: deckTopics,
        mode: "weak_topic",
        limit: 10,
      }),
    });
  }

  for (const weak of snapshot.weakTopics) {
    if (items.length >= 3) break;
    if (usedDecks.has(weak.deckId)) continue;
    usedDecks.add(weak.deckId);
    items.push({
      id: `weak-${weak.deckId}`,
      title: weak.deckTitle,
      detail: `Weak area: ${weak.topic}`,
      minutes: minutesFor(10),
      href: sessionHref({
        deckId: weak.deckId,
        topics: [weak.topic],
        mode: "weak_topic",
        limit: 10,
      }),
    });
  }

  for (const deck of snapshot.decks) {
    if (items.length >= 3) break;
    if (usedDecks.has(deck.id)) continue;
    usedDecks.add(deck.id);
    items.push({
      id: `deck-${deck.id}`,
      title: deck.title,
      detail: deck.mastery === null ? "Not studied yet" : `${deck.mastery}% mastered`,
      minutes: minutesFor(15),
      href: sessionHref({ deckId: deck.id }),
    });
  }

  return items;
}

export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
