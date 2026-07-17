// Canonical, deterministic mastery-tier calculation. Nothing here is
// AI-driven -- it's a pure function of correct/total counts, the same
// deterministic-miss-count philosophy as lib/resultsStats.ts. An AI may
// summarize/explain the evidence behind a tier elsewhere in the app, but it
// never gets a vote on which tier a topic is actually in.
//
// This exists because two independent status systems (lib/srsSchedule.ts's
// weak/improving/mastered, and lib/clashpath.ts's mastered/close/weak) each
// had the same bug: neither required a minimum sample size, so a single
// lucky guess on a topic's first-ever question could immediately label it
// "mastered." The MIN_ATTEMPTS_FOR_HIGH_TIER guard below fixes that -- a
// topic can't be called "Strong" or "Mastered" until there's enough
// evidence to actually support that claim, no matter how high the accuracy
// looks on too few attempts.
export type MasteryTier = "needs_review" | "developing" | "strong" | "mastered";

export const MASTERY_TIER_LABELS: Record<MasteryTier, string> = {
  needs_review: "Needs Review",
  developing: "Developing",
  strong: "Strong",
  mastered: "Mastered",
};

export const MASTERY_TIER_ORDER: MasteryTier[] = ["needs_review", "developing", "strong", "mastered"];

// Below this many attempts, a topic is capped at "Developing" regardless of
// accuracy -- one correct answer out of one is 100% but proves nothing yet.
export const MIN_ATTEMPTS_FOR_HIGH_TIER = 3;

const NEEDS_REVIEW_MAX_ACCURACY = 50;
const DEVELOPING_MAX_ACCURACY = 75;
const MASTERED_MIN_ACCURACY = 90;

export function getMasteryTier(correct: number, total: number): MasteryTier {
  if (total <= 0) return "needs_review";

  const accuracy = (correct / total) * 100;

  if (accuracy < NEEDS_REVIEW_MAX_ACCURACY) return "needs_review";
  if (accuracy < DEVELOPING_MAX_ACCURACY) return "developing";

  // accuracy >= 75% from here down, but not yet enough attempts to trust it.
  if (total < MIN_ATTEMPTS_FOR_HIGH_TIER) return "developing";

  return accuracy >= MASTERED_MIN_ACCURACY ? "mastered" : "strong";
}
