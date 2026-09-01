// What a customer is told about their own subscription.
//
// Pure, and in lib/ with tests, for the same reason lib/mastery.ts and
// lib/planLimits.ts are: getting it wrong does not throw, it just quietly
// tells a paying customer the wrong thing about their money. "Renews on the
// 3rd" when it actually cancels on the 3rd is the kind of bug that surfaces
// as a chargeback rather than a stack trace.

export type SubscriptionStatus = {
  status: string;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
};

/**
 * Statuses that mean the customer has a live subscription worth showing
 * billing controls for. Mirrors PRO_GRANTING_STATUSES in the Stripe webhook
 * (app/api/stripe/webhook/route.ts) -- past_due is included because Stripe
 * is still retrying the card and access has not lapsed yet.
 */
export const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

export function isLiveSubscription(
  subscription: SubscriptionStatus | null | undefined
): boolean {
  return !!subscription && LIVE_SUBSCRIPTION_STATUSES.has(subscription.status);
}

/**
 * Renders an ISO timestamp as a date a person would say out loud.
 *
 * Formatted in the *reader's* timezone, deliberately. Stripe's
 * current_period_end is an instant, not a calendar date, and it very often
 * lands on UTC midnight -- so formatting it as UTC would tell a student in
 * California "September 3" for a charge that, where they are, happens on
 * the evening of September 2. The date they can act on is their own.
 *
 * `timeZone` exists so tests can pin one; production passes nothing.
 */
export function formatRenewalDate(
  iso: string | null | undefined,
  locale?: string,
  timeZone?: string
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

/**
 * One line describing where this subscription stands.
 *
 * Order matters. A past_due card is the only thing on this list the
 * customer has to act on, so it outranks everything; and a subscription set
 * to cancel is described as cancelling even while its status is still
 * "active", because "Renews on the 3rd" is actively false for a
 * subscription that ends on the 3rd.
 */
export function describeSubscription(
  subscription: SubscriptionStatus | null | undefined,
  locale?: string,
  timeZone?: string
): string | null {
  if (!subscription) return null;

  const renews = formatRenewalDate(subscription.current_period_end, locale, timeZone);

  if (subscription.status === "past_due") {
    return "Your last payment did not go through. Update your card to keep Pro.";
  }

  if (subscription.cancel_at_period_end) {
    return renews
      ? `Cancels on ${renews}. You keep Pro until then.`
      : "Cancels at the end of this billing period.";
  }

  if (subscription.status === "trialing") {
    return renews ? `Free trial, then renews ${renews}.` : "Free trial.";
  }

  if (subscription.status === "active") {
    return renews ? `Renews ${renews}.` : "Active.";
  }

  return null;
}
