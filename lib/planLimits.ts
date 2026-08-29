// Daily generation caps, and the one line of copy describing the free plan.
//
// Two different axes exist and it is worth keeping them straight:
//
//   here          per-DAY generation caps. Still uncapped -- rate limiting
//                 handles abuse, and a daily cap on top of a monthly one
//                 just makes the product feel broken on a cram night.
//   lib/tiers.ts  per-MONTH knowledge map caps, Card Crack, ingestion and
//                 themes. That is where the free/Pro line actually sits.
//
// `null` is the app-wide convention for "no limit" (it matches
// `membership_plans.daily_limit`, which is nullable and means the same).

/** Deck generations allowed per day. `null` = unlimited. */
export const FREE_DAILY_GENERATION_CAP: number | null = null;

/** PDF-sourced generations allowed per day. `null` = unlimited. */
export const FREE_DAILY_PDF_CAP: number | null = null;

/** True when a plan has no generation limits at all. */
export const IS_UNLIMITED =
  FREE_DAILY_GENERATION_CAP === null && FREE_DAILY_PDF_CAP === null;

// The single line of copy every surface (homepage, pricing page, home,
// upgrade prompts) should use to describe the generation limit, so wording
// never drifts from what's actually enforced.
export const FREE_PLAN_LIMIT_SUMMARY =
  "Free covers 3 knowledge maps a month with 5 cards per concept. Ace Pro removes every cap.";

// Short form for tight spaces (badges, plan cards).
export const FREE_PLAN_LIMIT_SHORT = "3 maps a month";
