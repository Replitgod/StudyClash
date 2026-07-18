// Deterministic coverage-matrix computation -- no AI calls. Question
// targets are a stated heuristic, not a measured constant; revisit once
// real usage data exists on what a sufficient question count actually is
// per importance tier.
const QUESTION_TARGET_BY_IMPORTANCE: Record<string, number> = {
  critical: 8,
  high: 6,
  medium: 4,
  low: 2,
};

// Difficulty is stored 1-5 on curriculum_questions (Section 16 schema) --
// "4 or 5" counts as a genuinely harder question for this check.
const HARD_DIFFICULTY_THRESHOLD = 4;
// Overrepresentation threshold: more than 1.5x the target is "more
// questions than this concept needs," flagged so effort can redirect to
// under-covered concepts instead.
const OVER_COVERAGE_MULTIPLIER = 1.5;

export type CoverageMatrixInput = {
  conceptId: string;
  importance: string | null;
  sourcePageCount: number;
  approvedQuestionCount: number;
  hasHardApprovedQuestion: boolean;
};

export type CoverageMatrixEntry = {
  conceptId: string;
  sourcePageCount: number;
  importance: string | null;
  questionTarget: number;
  approvedQuestionCount: number;
  coverageStatus: "not_covered" | "under_covered" | "covered" | "over_covered";
  needsHarderQuestions: boolean;
};

export function computeCoverageEntry(input: CoverageMatrixInput): CoverageMatrixEntry {
  const questionTarget = QUESTION_TARGET_BY_IMPORTANCE[input.importance || "medium"] ?? QUESTION_TARGET_BY_IMPORTANCE.medium;

  let coverageStatus: CoverageMatrixEntry["coverageStatus"];
  if (input.approvedQuestionCount === 0) {
    coverageStatus = "not_covered";
  } else if (input.approvedQuestionCount > questionTarget * OVER_COVERAGE_MULTIPLIER) {
    coverageStatus = "over_covered";
  } else if (input.approvedQuestionCount >= questionTarget) {
    coverageStatus = "covered";
  } else {
    coverageStatus = "under_covered";
  }

  // Only a high/critical concept with real question coverage but no hard
  // question yet is flagged -- a not-yet-covered concept needs questions
  // generated at all difficulty levels, not specifically "harder" ones.
  const needsHarderQuestions =
    ["high", "critical"].includes(input.importance || "") &&
    input.approvedQuestionCount > 0 &&
    !input.hasHardApprovedQuestion;

  return {
    conceptId: input.conceptId,
    sourcePageCount: input.sourcePageCount,
    importance: input.importance,
    questionTarget,
    approvedQuestionCount: input.approvedQuestionCount,
    coverageStatus,
    needsHarderQuestions,
  };
}

export { HARD_DIFFICULTY_THRESHOLD };
