// The AceDecks tier model, and the billing governor that enforces it.
//
// One source of truth for what each tier costs, what it unlocks, and what
// happens when a free user runs out. Every surface -- pricing page, upgrade
// prompts, the API routes that actually refuse work -- reads from here, so
// the price on the marketing page and the number the server enforces cannot
// drift apart.
//
// The governor is a pure function on purpose. Whether a request is allowed
// is a decision that has to be identical on the client (to grey out a
// button) and on the server (to actually refuse), and the only way to
// guarantee that is to run the same code in both places. The client copy is
// advisory; the server call is the one that counts.

export type TierId = "free" | "pro" | "classroom";

export type Tier = {
  id: TierId;
  label: string;
  /** Display price, already formatted. */
  price: string;
  period: string;
  /** Price in cents, for Stripe and for any arithmetic. */
  amountCents: number;
  tagline: string;
  features: string[];
  /** Knowledge maps per calendar month. null = unlimited. */
  monthlyMapCap: number | null;
  /** Flashcards generated per concept. null = unlimited. */
  cardsPerConceptCap: number | null;
  /** Full Card Crack breakdown, or just the correct answer. */
  cardCrack: boolean;
  /** Priority model routing. */
  priorityProcessing: boolean;
  /** Handwriting / large-PDF ingestion. */
  advancedIngestion: boolean;
  /** Custom aesthetic themes. */
  customThemes: boolean;
  /** Shared maps and group decay tracking. */
  collaborative: boolean;
};

export const TIERS: Record<TierId, Tier> = {
  free: {
    id: "free",
    label: "Free",
    price: "$0",
    period: "forever",
    amountCents: 0,
    tagline: "Enough to prove it works on your own material.",
    features: [
      "3 knowledge maps per month",
      "5 flashcards per concept",
      "Standard processing speed",
      "The answer, and why it is right",
    ],
    monthlyMapCap: 3,
    cardsPerConceptCap: 5,
    cardCrack: false,
    priorityProcessing: false,
    advancedIngestion: false,
    customThemes: false,
    collaborative: false,
  },
  pro: {
    id: "pro",
    label: "Ace Pro",
    price: "$9.99",
    period: "per month",
    amountCents: 999,
    tagline: "Unlimited everything, and the full misconception breakdown.",
    features: [
      "Unlimited knowledge maps",
      "Unlimited flashcards per concept",
      "Handwriting and large-PDF ingestion",
      "Priority processing",
      "Full Card Crack breakdowns",
      "Custom aesthetic themes",
    ],
    monthlyMapCap: null,
    cardsPerConceptCap: null,
    cardCrack: true,
    priorityProcessing: true,
    advancedIngestion: true,
    customThemes: true,
    collaborative: false,
  },
  classroom: {
    id: "classroom",
    label: "Ace Classroom",
    price: "$199",
    period: "per year",
    amountCents: 19900,
    tagline: "Everything in Pro, shared across a class.",
    features: [
      "Everything in Ace Pro",
      "Collaborative knowledge maps",
      "Collective group decay tracking",
      "Class-wide weak-topic reporting",
    ],
    monthlyMapCap: null,
    cardsPerConceptCap: null,
    cardCrack: true,
    priorityProcessing: true,
    advancedIngestion: true,
    customThemes: true,
    collaborative: true,
  },
};

export const PUBLIC_TIERS: Tier[] = [TIERS.free, TIERS.pro, TIERS.classroom];

/** Unknown or missing tier ids resolve to free rather than throwing. */
export function resolveTier(id: string | null | undefined): Tier {
  if (id === "pro" || id === "classroom") return TIERS[id];
  return TIERS.free;
}

/* ------------------------------------------------- the billing governor */

export type UsageState = {
  /** Knowledge maps created in the current calendar month. */
  mapsThisMonth: number;
};

export type RequestedAction =
  | "create_map"
  | "generate_cards"
  | "card_crack"
  | "advanced_ingest"
  | "set_theme";

/**
 * Rough cost band for an action, used for logging and for deciding whether
 * to route to the priority model. Not a token count -- an estimate is
 * enough to keep the expensive paths off the free tier.
 */
export type TokenWeight = "low" | "medium" | "high";

const ACTION_WEIGHT: Record<RequestedAction, TokenWeight> = {
  create_map: "high",
  generate_cards: "medium",
  card_crack: "medium",
  advanced_ingest: "high",
  set_theme: "low",
};

export type GovernorDecision = {
  limitEnforced: boolean;
  currentTier: TierId;
  calculatedTokenWeight: TokenWeight;
  actionAllowed: boolean;
  /** Null when allowed. A student-facing sentence when not. */
  reason: string | null;
  /** Maps left this month. null = unlimited. */
  mapsRemaining: number | null;
  /** True when the reason for refusal is fixable by upgrading. */
  upgradeUnlocks: boolean;
};

/**
 * Decides whether one request may proceed.
 *
 * Refusals always carry a reason written for a student, never a code. A
 * blocked action that cannot explain itself is indistinguishable from a
 * broken one, and the student's next move is to leave rather than upgrade.
 */
export function evaluateRequest(args: {
  tier: TierId | string | null | undefined;
  action: RequestedAction;
  usage: UsageState;
}): GovernorDecision {
  const tier = resolveTier(typeof args.tier === "string" ? args.tier : null);
  const weight = ACTION_WEIGHT[args.action] ?? "low";

  const used = Math.max(0, Math.floor(args.usage.mapsThisMonth || 0));
  const mapsRemaining =
    tier.monthlyMapCap === null ? null : Math.max(0, tier.monthlyMapCap - used);

  const base: GovernorDecision = {
    limitEnforced: false,
    currentTier: tier.id,
    calculatedTokenWeight: weight,
    actionAllowed: true,
    reason: null,
    mapsRemaining,
    upgradeUnlocks: false,
  };

  if (args.action === "create_map" && mapsRemaining !== null && mapsRemaining <= 0) {
    return {
      ...base,
      limitEnforced: true,
      actionAllowed: false,
      upgradeUnlocks: true,
      reason: `You have used all ${tier.monthlyMapCap} knowledge maps this month. Ace Pro removes the cap.`,
    };
  }

  if (args.action === "card_crack" && !tier.cardCrack) {
    return {
      ...base,
      limitEnforced: true,
      actionAllowed: false,
      upgradeUnlocks: true,
      reason:
        "Card Crack breaks a wrong answer into the misconception behind it. It is part of Ace Pro.",
    };
  }

  if (args.action === "advanced_ingest" && !tier.advancedIngestion) {
    return {
      ...base,
      limitEnforced: true,
      actionAllowed: false,
      upgradeUnlocks: true,
      reason: "Handwriting and large-PDF ingestion are part of Ace Pro.",
    };
  }

  if (args.action === "set_theme" && !tier.customThemes) {
    return {
      ...base,
      limitEnforced: true,
      actionAllowed: false,
      upgradeUnlocks: true,
      reason: "Custom themes are part of Ace Pro.",
    };
  }

  return base;
}

/** How many cards a tier may generate for one concept. */
export function cardsAllowed(tierId: TierId | string | null | undefined, requested: number): number {
  const tier = resolveTier(typeof tierId === "string" ? tierId : null);
  const want = Math.max(1, Math.floor(requested || 0));
  if (tier.cardsPerConceptCap === null) return want;
  return Math.min(want, tier.cardsPerConceptCap);
}

/**
 * "Included in Ace Pro ($9.99 per month)".
 *
 * Built from the tier rather than written out, for the same reason every price
 * on /pricing reads from this module: the exam pages carried a hardcoded
 * "Included in AceDecks Pro ($3/mo)" on nine cards long after Pro moved to
 * $9.99, so the app was quoting a price it does not charge. A literal cannot
 * be kept in step with Stripe; this can.
 */
export function includedInProLabel(): string {
  const pro = TIERS.pro;
  return `Included in ${pro.label} (${pro.price} ${pro.period})`;
}
