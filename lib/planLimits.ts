// Single source of truth for what the free plan is allowed to do.
//
// AceDecks is now run as a single-user / open-access app: there is no daily
// generation cap, no PDF cap, and no beta access code gate. Everything is
// unlimited on every plan.
//
// These constants are kept (rather than deleted) because several surfaces
// import them for copy, and `null` is the app-wide convention for "no
// limit" (it matches `membership_plans.daily_limit`, which is nullable and
// means unlimited there too).

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
  "Everything is unlimited: unlimited decks, unlimited uploads, unlimited practice, unlimited AI.";

// Short form for tight spaces (badges, plan cards).
export const FREE_PLAN_LIMIT_SHORT = "Unlimited everything";
