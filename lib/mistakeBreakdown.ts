export type MistakeType =
  | "careless_mistake"
  | "careless_error"
  | "concept_gap"
  | "slow_response"
  | "speed_trap"
  | "misread_question"
  | "guessing_pattern"
  | "repeated_weakness"
  | "almost_mastered";

export type RematchMode =
  | "quick_check"
  | "weak_topic"
  | "review_missed"
  | "practice";

export type ReviewLikeItem = {
  questionId: string;
  questionText: string;
  topic: string;
  difficulty: string;
  selectedAnswer: string;
  correctAnswer: string;
  explanation: string;
  responseTimeMs: number;
  isCorrect: boolean;
};

export type MistakeHistoryStats = {
  topicMisses: Record<string, number>;
  selectedOptionRepeats: Record<string, number>;
  conceptMisses?: Record<string, number>;
  confidenceMisses?: Partial<Record<MistakeType, number>>;
};

export type MistakeBreakdown = {
  questionId: string;
  questionText: string;
  topic: string;
  selectedAnswer: string;
  correctAnswer: string;
  temptingButWrongReason: string;
  correctWhyReason: string;
  misunderstoodConcept: string;
  simplerExplanation: string;
  memoryTrick: string;
  miniFollowUpQuestion: string;
  confidenceRating: MistakeType;
  confidenceReason: string;
  conceptKey: string;
  mistakePatternKey: string;
  rematchMode: RematchMode;
  fixWeaknessHref: string;
  responseTimeMs: number;
  difficulty: string;
};

function normalizeTopic(topic: string): string {
  return (topic || "General").trim() || "General";
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSimpleSentence(value: string): string {
  const clean = value.trim();
  if (!clean) return "Start with the core definition, then connect it to one concrete example.";

  const first = clean
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)[0]
    .trim();

  if (!first) return "Start with the core definition, then connect it to one concrete example.";

  return `Simple version: ${first}`;
}

function buildMemoryTrick(topic: string, correctAnswer: string): string {
  const cleanTopic = normalizeTopic(topic);
  const initials = cleanTopic
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const seed = initials || "KEY";
  return `${seed} rule: Pick "${correctAnswer}", then state one must-have clue for ${cleanTopic}. If you cannot name the clue, re-check the stem.`;
}

function inferMisunderstoodConcept(topic: string, questionText: string): string {
  const cleanQuestion = questionText.replace(/\s+/g, " ").trim();
  if (!cleanQuestion) return `${normalizeTopic(topic)} core rule`;

  const compact = cleanQuestion.length > 90 ? `${cleanQuestion.slice(0, 90)}...` : cleanQuestion;
  return `${normalizeTopic(topic)}: ${compact}`;
}

function buildConceptKey(topic: string, misunderstoodConcept: string): string {
  const topicKey = normalizeKey(topic || "general");
  const conceptKey = normalizeKey(misunderstoodConcept || "core rule");
  const compactConcept = conceptKey.split(" ").slice(0, 8).join(" ");
  return `${topicKey}::${compactConcept || "core rule"}`;
}

function buildMiniFollowUpQuestion(topic: string, correctAnswer: string): string {
  const cleanTopic = normalizeTopic(topic);
  return `Mini check (${cleanTopic}): Which clue in the question proves "${correctAnswer}" is correct? Answer in one sentence, then name one distractor pattern to avoid.`;
}

function getRematchModeForType(type: MistakeType): RematchMode {
  if (type === "careless_mistake" || type === "careless_error") return "quick_check";
  if (type === "misread_question") return "review_missed";
  if (type === "speed_trap" || type === "slow_response") return "review_missed";
  if (type === "repeated_weakness") return "weak_topic";
  if (type === "almost_mastered") return "practice";
  if (type === "concept_gap") return "weak_topic";
  return "practice";
}

function buildTemptingReason(args: {
  type: MistakeType;
  selectedAnswer: string;
  topic: string;
}): string {
  const { type, selectedAnswer, topic } = args;

  if (type === "careless_mistake") {
    return `"${selectedAnswer}" looked familiar in ${normalizeTopic(topic)}, but this likely came from speed-scanning and locking onto an early keyword instead of the full condition.`;
  }

  if (type === "misread_question") {
    return `"${selectedAnswer}" likely came from misreading qualifiers in the prompt (like except, not, first, most likely), not from a full concept failure.`;
  }

  if (type === "repeated_weakness") {
    return `"${selectedAnswer}" keeps appearing in the same weak lane for ${normalizeTopic(topic)}, which signals a repeated misunderstanding rather than a one-off miss.`;
  }

  if (type === "almost_mastered") {
    return `"${selectedAnswer}" was close to correct logic, suggesting near-mastery with one missing rule check.`;
  }

  if (type === "speed_trap") {
    return `"${selectedAnswer}" may come from rushing under time pressure and choosing a plausible shortcut instead of verifying every condition.`;
  }

  if (type === "slow_response") {
    return `"${selectedAnswer}" can feel safe after long deliberation, but over-checking often blurs the deciding clue and leads to a near-match instead of an exact match.`;
  }

  if (type === "guessing_pattern") {
    return `"${selectedAnswer}" is a believable distractor, and your pattern suggests answer-shape guessing rather than concept-first elimination.`;
  }

  return `"${selectedAnswer}" is a common misconception in ${normalizeTopic(topic)} because it mirrors part of the correct logic but misses a required condition.`;
}

function buildCorrectReason(correctAnswer: string, explanation: string): string {
  const reason = explanation.trim();
  if (!reason) {
    return `"${correctAnswer}" is correct because it directly matches the concept being tested.`;
  }

  return `"${correctAnswer}" is right. ${reason}`;
}

function inferMistakeType(args: {
  topic: string;
  difficulty: string;
  responseTimeMs: number;
  questionId: string;
  selectedAnswer: string;
  conceptKey: string;
  history: MistakeHistoryStats;
}): { type: MistakeType; reason: string } {
  const {
    topic,
    difficulty,
    responseTimeMs,
    questionId,
    selectedAnswer,
    conceptKey,
    history,
  } = args;

  const normalizedTopic = normalizeTopic(topic).toLowerCase();
  const topicMisses = history.topicMisses[normalizedTopic] || 0;
  const conceptMisses = history.conceptMisses?.[conceptKey] || 0;
  const repeatKey = `${questionId}::${selectedAnswer}`.toLowerCase();
  const repeatedSelection = history.selectedOptionRepeats[repeatKey] || 0;
  const slowPattern = history.confidenceMisses?.slow_response || 0;
  const speedTrapPattern = history.confidenceMisses?.speed_trap || 0;
  const conceptPattern = history.confidenceMisses?.concept_gap || 0;
  const repeatedPattern = history.confidenceMisses?.repeated_weakness || 0;
  const almostMasteredPattern = history.confidenceMisses?.almost_mastered || 0;
  const cleanDifficulty = difficulty.toLowerCase();
  const isHard = cleanDifficulty === "hard";
  const lowerSelected = selectedAnswer.toLowerCase();
  const likelyMisread = /all|none|except|not|always|never|both/.test(lowerSelected);

  if (responseTimeMs >= 15000 || ((slowPattern + speedTrapPattern) >= 3 && responseTimeMs >= 11000)) {
    return {
      type: "speed_trap",
      reason: "Long response time and pressure signals indicate a speed trap.",
    };
  }

  if (responseTimeMs <= 5000 && !isHard) {
    return {
      type: "careless_error",
      reason: "Fast response suggests a rushed read rather than deep confusion.",
    };
  }

  if (likelyMisread) {
    return {
      type: "misread_question",
      reason: "Answer pattern suggests the prompt was misread or qualifiers were skipped.",
    };
  }

  if (topicMisses >= 4 || conceptMisses >= 3 || repeatedPattern >= 3) {
    return {
      type: "repeated_weakness",
      reason: "This topic has repeated misses across attempts.",
    };
  }

  if (topicMisses >= 3 || conceptMisses >= 2 || (conceptPattern >= 4 && isHard)) {
    return {
      type: "concept_gap",
      reason: "Repeated misses on the same concept/topic indicate a knowledge gap.",
    };
  }

  if (repeatedSelection >= 2) {
    return {
      type: "guessing_pattern",
      reason: "The same distractor was chosen repeatedly on this question.",
    };
  }

  if (!isHard && (topicMisses <= 2 || almostMasteredPattern >= 1)) {
    return {
      type: "almost_mastered",
      reason: "Performance suggests near mastery with small remaining gaps.",
    };
  }

  if (isHard) {
    return {
      type: "concept_gap",
      reason: "Hard question miss with no speed signal usually points to concept depth.",
    };
  }

  return {
    type: "guessing_pattern",
    reason: "No dominant timing or topic signal; uncertainty-guess behavior is most likely.",
  };
}

export function getMistakeTypeLabel(type: MistakeType): string {
  if (type === "careless_mistake" || type === "careless_error") return "Careless Error";
  if (type === "concept_gap") return "Concept gap";
  if (type === "slow_response" || type === "speed_trap") return "Speed Trap";
  if (type === "misread_question") return "Misread Question";
  if (type === "repeated_weakness") return "Repeated Weakness";
  if (type === "almost_mastered") return "Almost Mastered";
  return "Guessing Pattern";
}

export function buildFixWeaknessHref(params: {
  deckId: string;
  topic: string;
  type: MistakeType;
}): string {
  const { deckId, topic, type } = params;
  const encodedTopic = encodeURIComponent(normalizeTopic(topic));
  const rematchMode = getRematchModeForType(type);
  const shortLimit = rematchMode === "weak_topic" ? 5 : 4;
  return `/battle/${deckId}?mode=${rematchMode}&topics=${encodedTopic}&mistakeType=${type}&limit=${shortLimit}`;
}

export function buildMistakeBreakdowns(params: {
  deckId: string;
  reviewItems: ReviewLikeItem[];
  history: MistakeHistoryStats;
}): MistakeBreakdown[] {
  const { deckId, reviewItems, history } = params;

  return reviewItems
    .filter((item) => !item.isCorrect)
    .map((item) => {
      const misunderstoodConcept = inferMisunderstoodConcept(item.topic, item.questionText);
      const conceptKey = buildConceptKey(item.topic, misunderstoodConcept);
      const confidenceInsight = inferMistakeType({
        topic: item.topic,
        difficulty: item.difficulty,
        responseTimeMs: item.responseTimeMs,
        questionId: item.questionId,
        selectedAnswer: item.selectedAnswer,
        conceptKey,
        history,
      });
      const rematchMode = getRematchModeForType(confidenceInsight.type);
      const mistakePatternKey = `${normalizeKey(item.topic)}::${confidenceInsight.type}::${normalizeKey(
        item.selectedAnswer
      )}`;

      return {
        questionId: item.questionId,
        questionText: item.questionText,
        topic: normalizeTopic(item.topic),
        selectedAnswer: item.selectedAnswer,
        correctAnswer: item.correctAnswer,
        temptingButWrongReason: buildTemptingReason({
          type: confidenceInsight.type,
          selectedAnswer: item.selectedAnswer,
          topic: item.topic,
        }),
        correctWhyReason: buildCorrectReason(item.correctAnswer, item.explanation),
        misunderstoodConcept,
        simplerExplanation: toSimpleSentence(item.explanation),
        memoryTrick: buildMemoryTrick(item.topic, item.correctAnswer),
        miniFollowUpQuestion: buildMiniFollowUpQuestion(item.topic, item.correctAnswer),
        confidenceRating: confidenceInsight.type,
        confidenceReason: confidenceInsight.reason,
        conceptKey,
        mistakePatternKey,
        rematchMode,
        fixWeaknessHref: buildFixWeaknessHref({
          deckId,
          topic: item.topic,
          type: confidenceInsight.type,
        }),
        responseTimeMs: item.responseTimeMs,
        difficulty: item.difficulty,
      };
    });
}
