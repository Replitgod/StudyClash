// Single source of truth for the free plan's actual enforced daily limits.
// Both the enforcement (app/api/generate-questions/route.ts) and every
// user-facing description of it (homepage, pricing, error messages) import
// from here so the numbers can never drift out of sync with each other.
//
// IMPORTANT — what this limit actually gates, precisely:
// FREE_DAILY_GENERATION_CAP counts rows in `generation_logs` for this user
// today (any source_kind), checked inside the DECK-GENERATION route. It
// does NOT touch battle play at all -- nothing in
// app/api/battle/finish/route.ts enforces a cap, so replaying an existing
// deck is always unlimited on every plan. The policy is exactly: "3 new
// deck generations per day, unlimited battles on decks you already have."
// (This used to be gated on completed-battle count instead of generation
// count, which produced a genuinely different -- and confusing -- policy
// than the "N generations/day" copy shown on the pricing page. Switched to
// a direct generation-count check so the enforcement and the copy describe
// the same thing.)
export const FREE_DAILY_GENERATION_CAP = 3;
// Subset of the cap above: counts `generation_logs` rows with
// source_kind = "pdf" for today. Not an additional limit on top of the 3 --
// PDF-sourced generations still count toward FREE_DAILY_GENERATION_CAP too.
export const FREE_DAILY_PDF_CAP = 2;

// The single line of copy every surface (homepage FAQ, pricing page,
// dashboard, upgrade prompts) should use to describe the free plan's
// generation limit, so wording never drifts from what's actually enforced
// above.
export const FREE_PLAN_LIMIT_SUMMARY = `Free: ${FREE_DAILY_GENERATION_CAP} deck generations per day (${FREE_DAILY_PDF_CAP} of those can start from a PDF upload) and unlimited battles on decks you already have. Pro removes the generation limit.`;

// Short form for tight spaces (badges, plan cards).
export const FREE_PLAN_LIMIT_SHORT = `${FREE_DAILY_GENERATION_CAP} deck generations/day, unlimited battles`;
