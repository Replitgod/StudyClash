import { resolveTier, type TierId } from "@/lib/tiers";

// Cost control for realtime voice.
//
// Realtime audio is billed per minute in both directions and is, by a wide
// margin, the most expensive thing AceDecks can do. A single tab left open
// on a desk overnight would cost more than the student's subscription, so
// the ceiling cannot be advisory -- it is enforced server-side before a
// session is minted, and again by a hard timer inside the call.
//
// Kept out of lib/tiers.ts's governor deliberately. evaluateRequest is about
// entitlements -- whether a tier may do a thing at all -- and this is a
// spend budget, which is a different question with different failure text:
// running out of minutes for today is not "upgrade to unlock", it is "come
// back tomorrow". Modelling it as an entitlement would have produced the
// wrong message at the wrong moment.
//
// Pure, so the numbers can be tested without a database.

export type VoiceBudget = {
  /** Minutes of call allowed per rolling day. */
  dailyMinutes: number;
  /** Hard ceiling on one call, whatever the daily budget says. */
  maxCallMinutes: number;
};

const BUDGETS: Record<TierId, VoiceBudget> = {
  // Enough for a real revision session most days, and cheap enough that a
  // free account cannot become a bill. Two ten-minute calls.
  free: { dailyMinutes: 20, maxCallMinutes: 10 },
  // Comfortably more than anyone studies out loud in one day, so a paying
  // student never meets this in normal use.
  pro: { dailyMinutes: 120, maxCallMinutes: 30 },
  classroom: { dailyMinutes: 240, maxCallMinutes: 30 },
};

export function voiceBudgetFor(planId: string | null | undefined): VoiceBudget {
  return BUDGETS[resolveTier(planId).id];
}

export type BudgetDecision = {
  allowed: boolean;
  /** Minutes left today after this call would start. */
  remainingMinutes: number;
  /** Length this call may run for, in ms. Never longer than what is left. */
  maxCallMs: number;
  /** Student-facing sentence. Null when allowed. */
  reason: string | null;
};

/**
 * Decide whether another call may start, and how long it may run.
 *
 * The returned `maxCallMs` is the important half: rather than refusing a
 * student who has four minutes left, it lets the call start and ends it on
 * time. A four-minute session is worth having; a refusal at the door is not.
 */
export function evaluateVoiceBudget(args: {
  planId: string | null | undefined;
  minutesUsedToday: number;
}): BudgetDecision {
  const budget = voiceBudgetFor(args.planId);
  const used = Math.max(0, args.minutesUsedToday);
  const remaining = Math.max(0, budget.dailyMinutes - used);

  // A sliver of budget is not worth a connection handshake, and rounding
  // means "0.4 minutes left" would otherwise mint a session that dies almost
  // immediately -- which reads as a broken call, not a spent budget.
  if (remaining < 1) {
    return {
      allowed: false,
      remainingMinutes: 0,
      maxCallMs: 0,
      reason: `You have used your ${budget.dailyMinutes} minutes of calling for today. It resets in the morning — the chat below still works in the meantime.`,
    };
  }

  const minutes = Math.min(remaining, budget.maxCallMinutes);

  return {
    allowed: true,
    remainingMinutes: remaining,
    maxCallMs: Math.round(minutes * 60_000),
    reason: null,
  };
}

/**
 * How long a call may sit with nobody saying anything before we hang up.
 *
 * This is the abandoned-tab case the brief calls out, and it is separate
 * from the daily budget because it is about a call that is being paid for
 * and not used at all. Generous enough to survive someone thinking hard
 * about a question, or getting up to find a textbook.
 */
export const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * How long a `live` session row may go unfinished before it is swept.
 *
 * Longer than the longest possible call plus its inactivity grace, so a
 * genuinely running session is never marked abandoned underneath itself.
 */
export const STALE_SESSION_MS = 45 * 60 * 1000;
