// Pure scoring/weak-topic math shared by the results page. Extracted out of
// app/results/[matchId]/page.tsx so it's testable without importing a page
// component (which drags in Supabase clients, VyraCoach, etc.).

export type TopicStat = {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
};

type ScoredReviewItem = {
  question: { topic?: string | null };
  isCorrect: boolean;
};

export function calculateAccuracy(correctAnswers: number, totalQuestions: number): number {
  if (totalQuestions <= 0) return 0;
  return Math.round((correctAnswers / totalQuestions) * 100);
}

// Groups review items by topic and computes accuracy per topic. This is the
// only place "weak topic" is decided from raw answers -- it's a deterministic
// miss-count, not an AI judgment call.
export function buildTopicStats(reviewItems: ScoredReviewItem[]): TopicStat[] {
  const statsByTopic = new Map<string, { correct: number; total: number }>();

  for (const item of reviewItems) {
    const topic = item.question.topic || "General";
    const entry = statsByTopic.get(topic) || { correct: 0, total: 0 };
    entry.total += 1;
    if (item.isCorrect) entry.correct += 1;
    statsByTopic.set(topic, entry);
  }

  return Array.from(statsByTopic.entries()).map(([topic, { correct, total }]) => ({
    topic,
    correct,
    total,
    accuracy: Math.round((correct / total) * 100),
  }));
}
