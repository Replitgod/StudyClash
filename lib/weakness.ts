// "Your biggest opportunity" -- and, crucially, what specifically is going
// wrong inside it.
//
// The mastery engine can already say *which* topic is weakest. On its own
// that is not actionable: "Radical Equations 51%" tells a student where the
// problem is but not what the problem is, so the only thing they can do is
// re-practise the whole topic and hope.
//
// This mines the recorded mistake breakdowns for the recurring sub-skills
// underneath a weak topic -- extraneous solutions, domain restrictions --
// so the student is told what they actually keep getting wrong, and one
// button takes them straight into practice on it. No setup, no menus.
//
// Everything is derived from mistakes the student really made. Nothing here
// invents a weakness to have something to show.

import type { TopicSummary } from "@/lib/studySnapshot";

export type MistakeRecord = {
  deckId: string;
  topic: string;
  /** The specific idea they misunderstood, as recorded at the time. */
  concept: string;
  /** The classified mistake type, e.g. careless_mistake / concept_gap. */
  confidence?: string | null;
};

export type WeaknessPattern = {
  label: string;
  count: number;
};

export type Opportunity = {
  deckId: string;
  deckTitle: string;
  topic: string;
  mastery: number;
  /** The recurring sub-skills inside this topic, most frequent first. */
  patterns: WeaknessPattern[];
  missCount: number;
  /** One line, written for a student, explaining why this is the pick. */
  reason: string;
  /** Roughly how long a repair session takes. */
  minutes: number;
};

/* ---------------------------------------------------------- normalising */

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turns a recorded concept string into something worth showing.
 *
 * The stored value is often "Topic: the first ninety characters of the
 * question..." because that is what the breakdown builder falls back to
 * when the model gave it nothing better. Showing that verbatim would be a
 * wall of truncated question text, so the topic prefix is stripped and the
 * remainder trimmed to a phrase.
 */
export function cleanPattern(concept: string, topic: string): string {
  let text = (concept || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  // Drop a leading "Topic:" / "Topic -" prefix, however it was written.
  const topicKey = normalise(topic);
  const separatorAt = text.search(/[:—-]/);
  if (separatorAt > 0 && separatorAt < text.length - 1) {
    const head = normalise(text.slice(0, separatorAt));
    if (head && (head === topicKey || topicKey.includes(head) || head.includes(topicKey))) {
      text = text.slice(separatorAt + 1).trim();
    }
  }

  text = text.replace(/^(the|a|an)\s+/i, "").replace(/\.+$/, "").trim();
  if (!text) return "";

  // A pattern is a phrase, not a paragraph. Cut at a word boundary.
  const MAX = 72;
  if (text.length > MAX) {
    const cut = text.slice(0, MAX);
    const lastSpace = cut.lastIndexOf(" ");
    text = `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }

  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Groups the recorded concepts for one topic into recurring patterns.
 *
 * Near-duplicates are merged on their first few significant words, so three
 * slightly different phrasings of the same misunderstanding show as one
 * pattern seen three times rather than three unrelated-looking problems.
 */
export function extractPatterns(
  mistakes: MistakeRecord[],
  topic: string,
  limit = 3
): WeaknessPattern[] {
  const buckets = new Map<string, { label: string; count: number }>();

  for (const mistake of mistakes) {
    const label = cleanPattern(mistake.concept, topic);
    if (!label) continue;

    const key = normalise(label).split(" ").slice(0, 5).join(" ");
    if (!key) continue;

    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      // Keep the shortest phrasing: it is usually the clearest.
      if (label.length < existing.label.length) existing.label = label;
    } else {
      buckets.set(key, { label, count: 1 });
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)))
    .slice(0, limit);
}

/* ------------------------------------------------------------ selecting */

// Below this, there is not enough evidence to tell a student they have a
// weakness. Being wrong about that sends them to practise something they
// are fine at and teaches them the recommendation is guesswork.
const MIN_ATTEMPTS = 3;

function reasonFor(topic: TopicSummary, patternCount: number): string {
  if (topic.isFading) {
    return `You had this at ${topic.state.strength}%. It has been long enough that it is slipping.`;
  }
  if (patternCount > 0) {
    return `The same few things keep costing you marks here.`;
  }
  if (topic.isDue) {
    return `Due for review — right now is when it sticks best.`;
  }
  return `Your weakest topic with enough practice behind it to be sure.`;
}

/**
 * Picks what is genuinely most worth fixing, with the detail to act on it.
 *
 * Ordering comes from the mastery engine's opportunity score, not raw
 * accuracy -- a strong topic slipping away is a bigger opportunity than an
 * obscure one that was never learned, because it is cheaper to save.
 */
export function findOpportunities(args: {
  topics: TopicSummary[];
  mistakes: MistakeRecord[];
  limit?: number;
}): Opportunity[] {
  const { topics, mistakes, limit = 3 } = args;

  const mistakesByTopic = new Map<string, MistakeRecord[]>();
  for (const mistake of mistakes) {
    const key = `${mistake.deckId}::${normalise(mistake.topic)}`;
    const list = mistakesByTopic.get(key) || [];
    list.push(mistake);
    mistakesByTopic.set(key, list);
  }

  return topics
    .filter((topic) => topic.total >= MIN_ATTEMPTS)
    // Already mastered and not slipping is not an opportunity.
    .filter((topic) => topic.tier !== "mastered" || topic.isFading)
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((topic) => {
      const related = mistakesByTopic.get(`${topic.deckId}::${normalise(topic.topic)}`) || [];
      const patterns = extractPatterns(related, topic.topic);

      return {
        deckId: topic.deckId,
        deckTitle: topic.deckTitle,
        topic: topic.topic,
        mastery: topic.mastery,
        patterns,
        missCount: Math.max(0, topic.total - topic.correct),
        reason: reasonFor(topic, patterns.length),
        // A repair session is ten questions, and a question runs about
        // 45 seconds once the explanation is read.
        minutes: 8,
      };
    });
}
