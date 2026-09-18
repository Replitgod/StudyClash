// Where every topic stands, in four words a student understands.
//
// One place decides which bucket a topic is in, so Practice, the Mastery
// Map and Home never describe the same topic two ways. Everything is read
// from the mastery model's state (lib/mastery.ts); nothing here is a new
// judgment.

import type { TopicSummary } from "@/lib/studySnapshot";

export type BucketId = "mastered" | "learning" | "slipping" | "needs_work";

export type Bucket = {
  id: BucketId;
  label: string;
  /** One line on what the bucket means, for a legend or a tooltip. */
  meaning: string;
  color: string;
  count: number;
  topics: TopicSummary[];
};

const ORDER: Array<Omit<Bucket, "count" | "topics">> = [
  {
    id: "mastered",
    label: "Mastered",
    meaning: "You know it and it is holding. It comes back only occasionally.",
    color: "var(--ok)",
  },
  {
    id: "learning",
    label: "Learning",
    meaning: "Getting there. More practice will lock it in.",
    color: "var(--brand)",
  },
  {
    id: "slipping",
    label: "Slipping",
    meaning: "You knew this, and it is fading. The cheapest thing to save.",
    color: "var(--warn)",
  },
  {
    id: "needs_work",
    label: "Needs work",
    meaning: "Not there yet. Worth a focused session.",
    color: "var(--bad)",
  },
];

/** Which bucket one topic belongs in. Fading beats everything: it is urgent. */
export function bucketFor(topic: Pick<TopicSummary, "tier" | "isFading">): BucketId {
  if (topic.isFading && topic.tier !== "needs_review") return "slipping";
  if (topic.tier === "mastered" || topic.tier === "strong") return "mastered";
  if (topic.tier === "developing") return "learning";
  return "needs_work";
}

export function progressBreakdown(topics: TopicSummary[]): { total: number; buckets: Bucket[] } {
  const grouped = new Map<BucketId, TopicSummary[]>();
  for (const topic of topics) {
    const id = bucketFor(topic);
    const list = grouped.get(id) || [];
    list.push(topic);
    grouped.set(id, list);
  }

  return {
    total: topics.length,
    buckets: ORDER.map((bucket) => {
      const list = (grouped.get(bucket.id) || []).slice().sort((a, b) => b.priority - a.priority);
      return { ...bucket, count: list.length, topics: list };
    }),
  };
}
