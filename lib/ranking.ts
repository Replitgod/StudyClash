// The competitive ladder: ratings, rank tiers and seasons.
//
// Section 11 sets the constraint that matters: "do not manipulate ranking
// unfairly merely to increase engagement -- the system should reward
// genuine competence." So this is a real Elo-style rating with an
// uncertainty term, not a number that only goes up. Losing to someone far
// weaker costs a lot; beating someone far stronger pays a lot; and a new
// player's rating moves fast until the system has seen enough of them to
// be confident, then slows down.
//
// Everything is pure. The server is the only thing allowed to call it (see
// section 73: rating changes must be server-controlled), but keeping the
// math here means the client can show an honest preview of what a result
// would be worth without being trusted to compute the real one.

export const STARTING_RATING = 1000;
export const STARTING_DEVIATION = 350;
const MIN_DEVIATION = 45;
const MIN_RATING = 100;

/* ------------------------------------------------------------------ elo */

/**
 * The probability the first player beats the second, on the standard
 * logistic curve: 400 points of gap is roughly 10-to-1 odds.
 */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

/**
 * How much one result is allowed to move a rating.
 *
 * Scaled by how uncertain the rating still is. A brand-new player at the
 * full deviation moves by up to ~64 points a game and settles quickly; a
 * player with 50 games behind them moves by ~20, so a single unlucky match
 * cannot undo a season of results.
 */
export function kFactor(deviation: number): number {
  const clamped = Math.max(MIN_DEVIATION, Math.min(STARTING_DEVIATION, deviation));
  return 16 + (clamped / STARTING_DEVIATION) * 48;
}

export type MatchOutcome = {
  /** 1 win, 0 loss, 0.5 draw. Partial credit is allowed for score share. */
  score: number;
  opponentRating: number;
};

export type RatingUpdate = {
  rating: number;
  deviation: number;
  delta: number;
  /** What the model thought would happen, 0-1. For "you were the underdog". */
  expected: number;
};

/**
 * Applies one result.
 *
 * Deviation shrinks toward the floor with every rated game, which is what
 * makes the ladder stabilise instead of oscillating forever.
 */
export function applyResult(
  current: { rating: number; deviation: number },
  outcome: MatchOutcome
): RatingUpdate {
  const rating = Number.isFinite(current.rating) ? current.rating : STARTING_RATING;
  const deviation = Number.isFinite(current.deviation)
    ? current.deviation
    : STARTING_DEVIATION;

  const score = Math.max(0, Math.min(1, outcome.score));
  const expected = expectedScore(rating, outcome.opponentRating);
  const k = kFactor(deviation);

  const delta = Math.round(k * (score - expected));
  // A rating floor stops a bad run from digging a hole that takes weeks to
  // climb out of, which is the point at which students stop playing ranked.
  const next = Math.max(MIN_RATING, rating + delta);

  return {
    rating: next,
    // Converges toward the floor, faster while still uncertain.
    deviation: Math.max(MIN_DEVIATION, Math.round(deviation * 0.94)),
    delta: next - rating,
    expected,
  };
}

/**
 * Turns a finished battle into a rated outcome.
 *
 * Uses score share rather than a flat win/loss so a narrow win is worth
 * less than a thrashing -- in a quiz, the margin genuinely carries
 * information about relative competence that a binary result throws away.
 * Clamped away from the extremes so one perfect game cannot be worth more
 * than beating a strong opponent repeatedly.
 */
export function outcomeFromScores(
  playerScore: number,
  opponentScore: number
): number {
  const total = playerScore + opponentScore;
  if (total <= 0) return 0.5;
  const share = playerScore / total;
  // Compress toward the middle: 0.1..0.9 rather than 0..1.
  return 0.1 + share * 0.8;
}

/* ----------------------------------------------------------------- ranks */

export type RankTier =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "master"
  | "grandmaster"
  | "elite";

export type Rank = {
  tier: RankTier;
  label: string;
  /** 1-3 within a tier, 1 being the highest. Null in the apex tiers. */
  division: number | null;
  /** e.g. "Gold I". */
  name: string;
  /** Rating at which this tier begins. */
  floor: number;
  /** Rating at which the next tier begins, or null at the top. */
  ceiling: number | null;
};

const TIERS: Array<{
  tier: RankTier;
  label: string;
  floor: number;
  divisions: number;
}> = [
  { tier: "bronze", label: "Bronze", floor: 0, divisions: 3 },
  { tier: "silver", label: "Silver", floor: 900, divisions: 3 },
  { tier: "gold", label: "Gold", floor: 1200, divisions: 3 },
  { tier: "platinum", label: "Platinum", floor: 1500, divisions: 3 },
  { tier: "diamond", label: "Diamond", floor: 1800, divisions: 3 },
  { tier: "master", label: "Master", floor: 2100, divisions: 1 },
  { tier: "grandmaster", label: "Grandmaster", floor: 2350, divisions: 1 },
  { tier: "elite", label: "AcedIQ Elite", floor: 2600, divisions: 1 },
];

export function rankForRating(rating: number): Rank {
  const value = Number.isFinite(rating) ? rating : STARTING_RATING;

  let index = 0;
  for (let i = 0; i < TIERS.length; i += 1) {
    if (value >= TIERS[i].floor) index = i;
  }

  const tier = TIERS[index];
  const nextFloor = index + 1 < TIERS.length ? TIERS[index + 1].floor : null;

  if (tier.divisions <= 1) {
    return {
      tier: tier.tier,
      label: tier.label,
      division: null,
      name: tier.label,
      floor: tier.floor,
      ceiling: nextFloor,
    };
  }

  // Divisions split the tier evenly, counting down: III at the bottom, I at
  // the top, which is the convention every competitive game uses.
  const span = (nextFloor ?? tier.floor + 300) - tier.floor;
  const step = span / tier.divisions;
  const offset = Math.min(tier.divisions - 1, Math.floor((value - tier.floor) / step));
  const division = tier.divisions - offset;

  return {
    tier: tier.tier,
    label: tier.label,
    division,
    name: `${tier.label} ${"I".repeat(division)}`,
    floor: tier.floor,
    ceiling: nextFloor,
  };
}

/** 0-100 through the current rank, for a progress bar. */
export function rankProgress(rating: number): number {
  const rank = rankForRating(rating);
  if (rank.ceiling === null) return 100;
  const span = rank.ceiling - rank.floor;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((rating - rank.floor) / span) * 100)));
}

/** True when a result crossed a tier boundary, which is worth celebrating. */
export function didRankChange(before: number, after: number): "up" | "down" | null {
  const from = rankForRating(before);
  const to = rankForRating(after);
  if (from.name === to.name) return null;
  return after > before ? "up" : "down";
}

/* --------------------------------------------------------------- seasons */

export type Season = {
  id: string;
  name: string;
  startedAt: string;
  endsAt: string;
};

export function daysRemaining(season: Pick<Season, "endsAt">, now = Date.now()): number {
  const end = Date.parse(season.endsAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
}

/**
 * Where a rating resets to at the end of a season.
 *
 * A full reset to 1000 throws away everything the ladder learned and makes
 * the first week of every season noise. Pulling a third of the way back
 * toward the start keeps the ladder meaningful while still giving everyone
 * something to climb.
 */
export function seasonResetRating(rating: number): number {
  return Math.round(rating - (rating - STARTING_RATING) / 3);
}

export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  if (total <= 0) return null;
  return Math.round((wins / total) * 100);
}
