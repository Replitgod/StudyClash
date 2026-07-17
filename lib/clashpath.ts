import { MIN_ATTEMPTS_FOR_HIGH_TIER } from "@/lib/masteryTiers";

export type ClashPathQuestionResult = {
  topic: string;
  difficulty: string;
  isCorrect: boolean;
  responseTimeMs: number;
  selectedAnswer?: string;
  correctAnswer?: string;
};

export type ClashPathAttempt = {
  accuracyPercent: number;
  avgResponseTimeMs: number;
  createdAt?: string;
  questions: ClashPathQuestionResult[];
};

export type ClashPathTopicInsight = {
  topic: string;
  masteryPercent: number;
  status: "mastered" | "close" | "weak";
  currentAccuracyPercent: number;
  improvementDeltaPercent: number | null;
  avgResponseTimeMs: number;
  incorrectCount: number;
};

export type ClashPathReason = {
  id:
    | "careless_error"
    | "slow_processing"
    | "repeated_pattern"
    | "concept_gap"
    | "distractor_confusion";
  title: string;
  detail: string;
};

export type ClashPathRecommendation = {
  label: string;
  href: string;
  reason: string;
};

export type ClashPathReport = {
  topicInsights: ClashPathTopicInsight[];
  masteredTopics: ClashPathTopicInsight[];
  closeTopics: ClashPathTopicInsight[];
  weakTopics: ClashPathTopicInsight[];
  whyMistakes: ClashPathReason[];
  improvementDeltaPercent: number | null;
  improvementSummary: string;
  nextBestBattle: ClashPathRecommendation;
  nextBestMove: string;
  clashRating: number;
  masteryMapLabel: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeTopic(input: string): string {
  return input.trim() || "General";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function accuracyPercent(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

type TopicAccumulator = {
  total: number;
  correct: number;
  responseTimes: number[];
  carelessErrors: number;
  slowErrors: number;
  hardWrong: number;
  repeatedWrongSignals: number;
};

function buildTopicAccumulator(
  questions: ClashPathQuestionResult[]
): Map<string, TopicAccumulator> {
  const byTopic = new Map<string, TopicAccumulator>();

  for (const question of questions) {
    const topic = normalizeTopic(question.topic);
    const current = byTopic.get(topic) || {
      total: 0,
      correct: 0,
      responseTimes: [],
      carelessErrors: 0,
      slowErrors: 0,
      hardWrong: 0,
      repeatedWrongSignals: 0,
    };

    current.total += 1;
    if (question.isCorrect) {
      current.correct += 1;
    } else {
      if (question.responseTimeMs <= 6000 && question.difficulty !== "hard") {
        current.carelessErrors += 1;
      }
      if (question.responseTimeMs >= 12000) {
        current.slowErrors += 1;
      }
      if (question.difficulty === "hard") {
        current.hardWrong += 1;
      }
      current.repeatedWrongSignals += 1;
    }

    current.responseTimes.push(Math.max(0, question.responseTimeMs || 0));
    byTopic.set(topic, current);
  }

  return byTopic;
}

function buildMistakePatternCount(
  attempts: ClashPathAttempt[]
): Map<string, number> {
  const wrongCountByTopic = new Map<string, number>();

  for (const attempt of attempts) {
    for (const question of attempt.questions) {
      if (question.isCorrect) continue;
      const topic = normalizeTopic(question.topic);
      wrongCountByTopic.set(topic, (wrongCountByTopic.get(topic) || 0) + 1);
    }
  }

  return wrongCountByTopic;
}

function buildDistractorCount(attempts: ClashPathAttempt[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const attempt of attempts) {
    for (const question of attempt.questions) {
      if (question.isCorrect) continue;
      const selected = question.selectedAnswer?.trim();
      if (!selected) continue;
      const topic = normalizeTopic(question.topic);
      const key = `${topic}::${selected}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return counts;
}

function buildImprovementSummary(delta: number | null): string {
  if (delta === null) {
    return "Baseline run recorded. Play one more battle to unlock trend detection.";
  }

  if (delta >= 8) {
    return `Strong upward trend: +${delta}% versus your recent runs.`;
  }

  if (delta > 0) {
    return `You are improving: +${delta}% versus your recent runs.`;
  }

  if (delta === 0) {
    return "Trend is stable. Push one weak topic to break through.";
  }

  return `Trend dipped by ${Math.abs(delta)}%. Target weak topics before the next full battle.`;
}

export function buildClashPathReport(params: {
  deckId: string;
  currentAttempt: ClashPathAttempt;
  historicalAttempts?: ClashPathAttempt[];
}): ClashPathReport {
  const historicalAttempts = params.historicalAttempts || [];
  const allAttempts = [...historicalAttempts, params.currentAttempt];

  const currentByTopic = buildTopicAccumulator(params.currentAttempt.questions);
  const historyByTopic = historicalAttempts.map((attempt) =>
    buildTopicAccumulator(attempt.questions)
  );
  const repeatedWrongCountByTopic = buildMistakePatternCount(allAttempts);
  const distractorCounts = buildDistractorCount(allAttempts);

  const topicInsights: ClashPathTopicInsight[] = [];

  for (const [topic, current] of currentByTopic.entries()) {
    const currentAccuracy = accuracyPercent(current.correct, current.total);
    const currentAvgResponse = Math.round(average(current.responseTimes));

    const historicalAccuracies = historyByTopic
      .map((topicMap) => topicMap.get(topic))
      .filter((entry): entry is TopicAccumulator => Boolean(entry))
      .map((entry) => accuracyPercent(entry.correct, entry.total));

    const historicalAvg =
      historicalAccuracies.length > 0
        ? Math.round(average(historicalAccuracies))
        : null;

    const trendBonus =
      historicalAvg === null ? 0 : clamp((currentAccuracy - historicalAvg) * 0.28, -12, 12);

    const speedAdjustment =
      currentAvgResponse <= 7000
        ? 7
        : currentAvgResponse <= 11000
          ? 2
          : currentAvgResponse <= 16000
            ? -3
            : -8;

    const repeatedPenalty =
      (repeatedWrongCountByTopic.get(topic) || 0) >= 4
        ? 10
        : (repeatedWrongCountByTopic.get(topic) || 0) >= 2
          ? 5
          : 0;

    const conceptPenalty = current.hardWrong >= 2 ? 6 : 0;
    const carelessPenalty = current.carelessErrors >= 2 ? 4 : 0;

    const mastery = Math.round(
      clamp(
        currentAccuracy + speedAdjustment + trendBonus - repeatedPenalty - conceptPenalty - carelessPenalty,
        0,
        100
      )
    );

    // A topic seen for the first time ever, answered correctly with a fast
    // response, can hit mastery=100 on this formula alone -- lifetimeAttempts
    // guards against calling that "mastered" before there's actually enough
    // evidence, same guard/threshold as lib/masteryTiers.ts uses for Mastery
    // Map so the two features don't disagree on what "enough attempts" means.
    const lifetimeAttempts =
      current.total +
      historyByTopic.reduce((sum, topicMap) => sum + (topicMap.get(topic)?.total || 0), 0);

    const status: ClashPathTopicInsight["status"] =
      mastery >= 85 && lifetimeAttempts >= MIN_ATTEMPTS_FOR_HIGH_TIER
        ? "mastered"
        : mastery >= 65
          ? "close"
          : "weak";

    topicInsights.push({
      topic,
      masteryPercent: mastery,
      status,
      currentAccuracyPercent: currentAccuracy,
      improvementDeltaPercent:
        historicalAvg === null ? null : Math.round((currentAccuracy - historicalAvg) * 10) / 10,
      avgResponseTimeMs: currentAvgResponse,
      incorrectCount: current.total - current.correct,
    });
  }

  topicInsights.sort((a, b) => b.masteryPercent - a.masteryPercent || a.topic.localeCompare(b.topic));

  const masteredTopics = topicInsights.filter((topic) => topic.status === "mastered");
  const closeTopics = topicInsights.filter((topic) => topic.status === "close");
  const weakTopics = topicInsights.filter((topic) => topic.status === "weak");

  const currentCareless = params.currentAttempt.questions.filter(
    (question) => !question.isCorrect && question.responseTimeMs <= 6000 && question.difficulty !== "hard"
  ).length;

  const currentSlow = params.currentAttempt.questions.filter(
    (question) => !question.isCorrect && question.responseTimeMs >= 12000
  ).length;

  const repeatedTopic = [...repeatedWrongCountByTopic.entries()]
    .filter(([, wrongCount]) => wrongCount >= 3)
    .sort((a, b) => b[1] - a[1])[0];

  const conceptGapTopic = weakTopics
    .filter((topic) => topic.incorrectCount >= 2)
    .sort((a, b) => b.incorrectCount - a.incorrectCount)[0];

  const distractorPattern = [...distractorCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])[0];

  const whyMistakes: ClashPathReason[] = [];

  if (currentCareless >= 2) {
    whyMistakes.push({
      id: "careless_error",
      title: "Careless errors",
      detail:
        "Multiple misses happened on fast responses. Pause for one extra check on easy and medium questions.",
    });
  }

  if (currentSlow >= 2) {
    whyMistakes.push({
      id: "slow_processing",
      title: "Slow response drag",
      detail:
        "Several misses came after long response times. Run short speed rounds to improve retrieval under time pressure.",
    });
  }

  if (repeatedTopic) {
    whyMistakes.push({
      id: "repeated_pattern",
      title: "Repeated mistake pattern",
      detail: `You repeatedly miss ${repeatedTopic[0]} (${repeatedTopic[1]} misses across runs).`,
    });
  }

  if (conceptGapTopic) {
    whyMistakes.push({
      id: "concept_gap",
      title: "Concept gap",
      detail: `${conceptGapTopic.topic} shows persistent low mastery and needs rebuild from first principles.`,
    });
  }

  if (distractorPattern) {
    const [rawKey, count] = distractorPattern;
    const [topic, selected] = rawKey.split("::");
    whyMistakes.push({
      id: "distractor_confusion",
      title: "Distractor confusion",
      detail: `In ${topic}, the same wrong choice (${selected}) appeared ${count} times.`,
    });
  }

  const historicalAccuracy = historicalAttempts
    .slice(-3)
    .map((attempt) => attempt.accuracyPercent);

  const improvementDeltaPercent =
    historicalAccuracy.length === 0
      ? null
      : Math.round(
          (params.currentAttempt.accuracyPercent - average(historicalAccuracy)) * 10
        ) / 10;

  const improvementSummary = buildImprovementSummary(improvementDeltaPercent);

  const weakestTopic = weakTopics[0] || null;
  const closeTopic = closeTopics[0] || null;

  const topicQuery = (topics: ClashPathTopicInsight[]) =>
    encodeURIComponent(topics.map((topic) => topic.topic).join(","));

  const nextBestBattle: ClashPathRecommendation = weakestTopic
    ? {
        label: "Target Weak Topic",
        href: `/battle/${params.deckId}?mode=weak_topic&topics=${topicQuery([weakestTopic])}`,
        reason: `${weakestTopic.topic} is your lowest mastery lane. Train it now for the fastest gain.`,
      }
    : closeTopic
      ? {
          label: "Close The Gap",
          href: `/battle/${params.deckId}?mode=review_missed&topics=${topicQuery(closeTopics.slice(0, 2))}`,
          reason: `You are close on ${closeTopic.topic}. One focused rematch can push it into mastered.`,
        }
      : {
          label: "Pressure Test",
          href: `/battle/${params.deckId}?mode=quick_check&limit=5`,
          reason: "No major weak lane detected. Run a fast pressure test to confirm retention.",
        };

  const nextBestMove = (() => {
    if (whyMistakes.some((reason) => reason.id === "careless_error")) {
      return "Activate double-check mode: verify units, signs, and qualifiers before locking in each answer.";
    }

    if (whyMistakes.some((reason) => reason.id === "slow_processing")) {
      return "Run two quick-check rounds and cap each answer at 12 seconds to build speed confidence.";
    }

    if (weakestTopic) {
      return `Rematch ${weakestTopic.topic} immediately, then replay the full deck once to validate transfer.`;
    }

    return "Push rating growth with one full rematch and aim for a cleaner, faster run than this battle.";
  })();

  const meanMastery = topicInsights.length
    ? average(topicInsights.map((topic) => topic.masteryPercent))
    : 50;

  const ratingRaw =
    900 +
    meanMastery * 7 +
    (improvementDeltaPercent || 0) * 8 +
    clamp((14000 - params.currentAttempt.avgResponseTimeMs) / 40, -80, 120) +
    (weakTopics.length === 0 ? 40 : 0);

  const clashRating = Math.round(clamp(ratingRaw, 600, 2400));

  const masteryMapLabel =
    weakTopics.length === 0
      ? "Arena stable"
      : weakTopics.length >= 3
        ? "Rebuild phase"
        : "Focused recovery";

  return {
    topicInsights,
    masteredTopics,
    closeTopics,
    weakTopics,
    whyMistakes,
    improvementDeltaPercent,
    improvementSummary,
    nextBestBattle,
    nextBestMove,
    clashRating,
    masteryMapLabel,
  };
}
