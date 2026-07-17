// Single source of truth for the free plan's actual enforced daily limits.
// Both the enforcement (app/api/generate-questions/route.ts) and every
// user-facing description of it (homepage, pricing, error messages) import
// from here so the numbers can never drift out of sync with each other.
//
// IMPORTANT — what this limit actually gates, precisely:
// FREE_DAILY_BATTLE_CAP counts completed battles (rows in `matches`,
// inserted by app/api/battle/finish/route.ts on submission) for today,
// checked inside the DECK-GENERATION route. It does NOT block playing a
// 4th, 5th, etc. battle on an already-existing deck -- nothing in
// battle/finish/route.ts enforces a cap. What it actually blocks is
// GENERATING A NEW DECK once the student has completed 3 battles (with any
// mix of new or previously-generated decks) that day. So the accurate
// description is "generate new decks freely until you've completed 3
// battles today," not "you can only play 3 battles a day" -- copy should
// reflect that exact mechanic rather than implying battle play itself is
// capped.
export const FREE_DAILY_BATTLE_CAP = 3;
// True generation-count cap: counts `generation_logs` rows with
// source_kind = "pdf" for today. Unlike the battle cap above, this one IS
// a straightforward "N PDF uploads generate a deck per day" limit.
export const FREE_DAILY_PDF_CAP = 2;

// The single line of copy every surface (homepage FAQ, pricing page,
// dashboard, upgrade prompts) should use to describe the free plan's
// battle-related limit, so wording never drifts from what's actually
// enforced above.
export const FREE_PLAN_LIMIT_SUMMARY = `Free accounts can generate new decks until you've completed ${FREE_DAILY_BATTLE_CAP} battles that day; ${FREE_DAILY_PDF_CAP} of those can start from a PDF upload. Pro removes both limits.`;

// Short form for tight spaces (badges, plan cards).
export const FREE_PLAN_LIMIT_SHORT = `Up to ${FREE_DAILY_BATTLE_CAP} battles/day on the Free plan`;
