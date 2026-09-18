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
// `mode` is read by /study for "test" (no feedback until the end) and
// "mistakes" (only what was missed last time); the older /battle screen
// reads the others.
export function sessionHref(args: {
  deckId: string;
  topics?: string[];
  mode?: "battle" | "practice" | "weak_topic" | "test" | "mistakes";
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

function wasKnownOnce(topic: TopicSummary): boolean {
  return topic.tier !== "needs_review" || topic.isFading;
}

export function getNextAction(snapshot: StudySnapshot): NextAction | null {
  if (snapshot.isEmpty) return null;

  // 1. Anything due for review beats anything new. This is the whole point
  //    of tracking mastery. The wording says which kind of review it is:
  //    something the student knew and is losing, or something they never
  //    got. "Review what you forgot" on a topic they never learned was
  //    telling them a story about themselves that was not true.
  const due = snapshot.dueTopics[0];
  if (due) {
    const topics = topicsInDeck(snapshot.dueTopics, due.deckId);
    const known = wasKnownOnce(due);
    return {
      label: known ? "Review before you forget" : "Practice your weak spots",
      reason:
        topics.length > 1
          ? `${topics.length} topics in ${due.deckTitle} are due`
          : known
            ? `${due.topic} is due for review`
            : `${due.topic} is ready for another try`,
      href: sessionHref({
        deckId: due.deckId,
        topics,
        mode: "weak_topic",
        limit: 10,
      }),
      minutes: minutesFor(10),
    };
  }

  // 2. Flashcards that are due. Short, and the cheapest review there is.
  const cardDeck = snapshot.decks
    .filter((deck) => deck.flashcardsDue > 0)
    .sort((a, b) => b.flashcardsDue - a.flashcardsDue)[0];
  if (cardDeck) {
    return {
      label: `Review ${cardDeck.flashcardsDue} flashcard${cardDeck.flashcardsDue === 1 ? "" : "s"}`,
      reason: `${cardDeck.title}: due today`,
      href: `/library/${cardDeck.id}?tab=cards`,
      minutes: Math.max(3, Math.round(cardDeck.flashcardsDue * 0.25)),
    };
  }

  // 3. Otherwise, the weakest thing they have practiced.
  const weak = snapshot.weakTopics[0];
  if (weak && weak.total >= 2) {
    return {
      label: "Practice your weak spot",
      reason: `${weak.topic} is at ${weak.mastery}% mastery${
        weak.confidentMisses > 0 ? ", and you've been sure of wrong answers on it" : ""
      }`,
      href: sessionHref({
        deckId: weak.deckId,
        topics: [weak.topic],
        mode: "weak_topic",
        limit: 10,
      }),
      minutes: minutesFor(10),
    };
  }

  // 4. Otherwise, anything they have added but never studied.
  const unstudied = snapshot.decks.find((deck) => deck.mastery === null);
  if (unstudied) {
    return {
      label: "Start studying",
      reason: `You haven't studied ${unstudied.title} yet`,
      href: sessionHref({ deckId: unstudied.id }),
      minutes: minutesFor(15),
    };
  }

  // 5. Everything is up to date. A short test without hints is the most
  //    useful thing left: it checks that "mastered" still holds without
  //    the explanation arriving straight after each answer.
  const recent = snapshot.decks[0];
  if (recent) {
    return {
      label: "Test yourself",
      reason:
        recent.mastery !== null
          ? `Nothing is due. ${recent.title} is at ${recent.mastery}%; a quick test keeps it there`
          : `Nothing is due. A quick test on ${recent.title} keeps it that way`,
      href: sessionHref({ deckId: recent.id, mode: "test", limit: 10 }),
      minutes: minutesFor(10),
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
          ? `${deckTopics.length} topics due for review`
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

  for (const deck of snapshot.decks) {
    if (items.length >= 3) break;
    if (deck.flashcardsDue <= 0 || usedDecks.has(deck.id)) continue;
    usedDecks.add(deck.id);
    items.push({
      id: `cards-${deck.id}`,
      title: deck.title,
      detail: `${deck.flashcardsDue} flashcard${deck.flashcardsDue === 1 ? "" : "s"} due`,
      minutes: Math.max(3, Math.round(deck.flashcardsDue * 0.25)),
      href: `/library/${deck.id}?tab=cards`,
    });
  }

  for (const weak of snapshot.weakTopics) {
    if (items.length >= 3) break;
    if (usedDecks.has(weak.deckId)) continue;
    usedDecks.add(weak.deckId);
    items.push({
      id: `weak-${weak.deckId}`,
      title: weak.deckTitle,
      detail: `Weak spot: ${weak.topic}`,
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
