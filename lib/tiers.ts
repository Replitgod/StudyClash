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

/**
 * How often a tier bills. An annual Ace Pro is the SAME tier at a different
 * interval, not a fourth tier -- every entitlement, the governor, and
 * profiles.plan are identical. Modelling it as a tier id would have meant
 * teaching resolveTier, evaluateRequest and the Stripe webhook about a
 * "pro_annual" that behaves exactly like "pro".
 */
export type BillingInterval = "month" | "year";

export type TierPrice = {
  interval: BillingInterval;
  /** Display price, already formatted. */
  price: string;
  period: string;
  /** Price in cents, for Stripe and for any arithmetic. */
  amountCents: number;
  /**
   * Name of the env var holding this price's Stripe price id. The id itself
   * is never in the repo, but which variable to read is, so checkout cannot
   * pick the wrong one by string-building it at the call site.
   */
  stripePriceEnvVar: string;
};

export type Tier = {
  id: TierId;
  label: string;
  /** Display price, already formatted. The default (monthly) option. */
  price: string;
  period: string;
  /** Price in cents, for Stripe and for any arithmetic. */
  amountCents: number;
  /**
   * Every way this tier can be bought, cheapest interval first. Always
   * contains at least the one matching `price`/`period`/`amountCents`.
   */
  prices: TierPrice[];
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
    prices: [],
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
    prices: [
      {
        interval: "month",
        price: "$9.99",
        period: "per month",
        amountCents: 999,
        stripePriceEnvVar: "STRIPE_PRO_PRICE_ID",
      },
      {
        // $99 a year against $9.99 x 12 = $119.88, so twelve months cost
        // less than ten. The savings line on the pricing page is computed
        // from these two numbers rather than written down, so it cannot
        // claim a discount the amounts do not support.
        interval: "year",
        price: "$99",
        period: "per year",
        amountCents: 9900,
        stripePriceEnvVar: "STRIPE_PRO_ANNUAL_PRICE_ID",
      },
    ],
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
    prices: [
      {
        interval: "year",
        price: "$199",
        period: "per year",
        amountCents: 19900,
        stripePriceEnvVar: "STRIPE_CLASSROOM_PRICE_ID",
      },
    ],
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

/* ------------------------------------------------------- billing intervals */

/** The price for one interval, or null if the tier is not sold that way. */
export function getTierPrice(
  tier: Tier,
  interval: BillingInterval
): TierPrice | null {
  return tier.prices.find((price) => price.interval === interval) ?? null;
}

/** True when a tier can actually be bought on both intervals. */
export function hasIntervalChoice(tier: Tier): boolean {
  return (
    getTierPrice(tier, "month") !== null && getTierPrice(tier, "year") !== null
  );
}

export type AnnualSaving = {
  /** Cents saved over a year versus paying monthly. */
  amountCents: number;
  /** Whole percent saved, rounded down so the claim is never overstated. */
  percent: number;
  /** Whole months of the monthly price the saving covers, rounded down. */
  monthsFree: number;
};

/**
 * What an annual plan actually saves, computed from the two amounts.
 *
 * Derived rather than written down on purpose: a "save 20%" badge sitting
 * next to prices that only support 17% is the deceptive-anchor pattern the
 * product brief rules out, and it is exactly what happens when the claim is
 * a string someone forgot to update. Returns null unless both intervals
 * exist and the annual one is genuinely cheaper.
 */
export function annualSaving(tier: Tier): AnnualSaving | null {
  const monthly = getTierPrice(tier, "month");
  const yearly = getTierPrice(tier, "year");
  if (!monthly || !yearly) return null;

  const payingMonthlyForAYear = monthly.amountCents * 12;
  const amountCents = payingMonthlyForAYear - yearly.amountCents;
  if (amountCents <= 0) return null;

  return {
    amountCents,
    percent: Math.floor((amountCents / payingMonthlyForAYear) * 100),
    monthsFree: Math.floor(amountCents / monthly.amountCents),
  };
}

/** "$20.88" / "$99" -- trailing ".00" dropped, because prices read better. */
export function formatCents(amountCents: number): string {
  const dollars = amountCents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
}

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
