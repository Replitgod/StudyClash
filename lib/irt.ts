// Item Response Theory (1-parameter logistic / Rasch model) for the
// Adaptive AI opponent. This is the standard textbook model, not a custom
// invention: student ability (theta) and item difficulty (beta) live on
// the same logit scale, and P(correct) follows the logistic curve
// P = 1 / (1 + e^-(theta - beta)). Ability updates online, one step per
// answer, via a single gradient step toward the observed outcome -- the
// same "prediction error times learning rate" form Elo/TrueSkill use,
// standing in for a full offline maximum-likelihood re-fit (which needs a
// large item-response matrix this app doesn't have yet for a session-only
// mode like Instant Battle).

export type DifficultyLabel = "easy" | "medium" | "hard";

const LEARNING_RATE = 0.6;

// Spaced so a theta=0 (average) student has roughly a 75/50/25% chance of
// answering each tier correctly: ln(0.75/0.25) ~= 1.1, ln(0.5/0.5) = 0,
// ln(0.25/0.75) ~= -1.1.
const DIFFICULTY_BETA: Record<DifficultyLabel, number> = {
  easy: -1.1,
  medium: 0,
  hard: 1.1,
};

export function difficultyToBeta(difficulty: string): number {
  const normalized = difficulty.trim().toLowerCase();
  if (normalized === "easy" || normalized === "medium" || normalized === "hard") {
    return DIFFICULTY_BETA[normalized];
  }
  return DIFFICULTY_BETA.medium;
}

// P(correct) for a student of ability `theta` facing an item of difficulty
// `beta`, per the Rasch model above.
export function probabilityCorrect(theta: number, beta: number): number {
  return 1 / (1 + Math.exp(-(theta - beta)));
}

// One online ability-update step. Rises after a correct answer (more so if
// the item was hard, i.e. predicted probability was low), falls after a
// miss (more so if the item was easy, i.e. predicted probability was
// high) -- the update is proportional to how surprising the outcome was,
// not just whether it was right or wrong.
export function updateAbility(theta: number, beta: number, correct: boolean): number {
  const predicted = probabilityCorrect(theta, beta);
  const outcome = correct ? 1 : 0;
  return theta + LEARNING_RATE * (outcome - predicted);
}
