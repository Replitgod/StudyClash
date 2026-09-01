import { describe, expect, it } from "vitest";
import {
  describeSubscription,
  formatRenewalDate,
  isLiveSubscription,
  type SubscriptionStatus,
} from "./billing";

function subscription(overrides: Partial<SubscriptionStatus> = {}): SubscriptionStatus {
  return {
    status: "active",
    cancel_at_period_end: false,
    current_period_end: "2026-09-03T12:00:00.000Z",
    ...overrides,
  };
}

describe("isLiveSubscription", () => {
  it("treats active, trialing and past_due as live", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(isLiveSubscription(subscription({ status }))).toBe(true);
    }
  });

  it("treats cancelled and unpaid as not live", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
      expect(isLiveSubscription(subscription({ status }))).toBe(false);
    }
  });

  it("is false when there is no subscription at all", () => {
    expect(isLiveSubscription(null)).toBe(false);
    expect(isLiveSubscription(undefined)).toBe(false);
  });
});

describe("formatRenewalDate", () => {
  it("returns null rather than 'Invalid Date' for unusable input", () => {
    expect(formatRenewalDate(null)).toBeNull();
    expect(formatRenewalDate("")).toBeNull();
    expect(formatRenewalDate("not a date")).toBeNull();
  });

  it("formats a real timestamp", () => {
    expect(formatRenewalDate("2026-09-03T12:00:00.000Z", "en-US")).toBe("September 3, 2026");
  });
});

describe("describeSubscription", () => {
  it("says nothing when there is no subscription", () => {
    expect(describeSubscription(null)).toBeNull();
  });

  it("leads with a failed payment, because it is the only actionable state", () => {
    const line = describeSubscription(subscription({ status: "past_due" }), "en-US", "UTC");
    expect(line).toContain("did not go through");
  });

  it("describes a cancelling subscription as cancelling, not renewing", () => {
    // Stripe keeps status "active" until the period actually ends, so this
    // is the case where the naive reading tells the customer the opposite
    // of what is about to happen.
    const line = describeSubscription(
      subscription({ status: "active", cancel_at_period_end: true }),
      "en-US",
      "UTC"
    );
    expect(line).toBe("Cancels on September 3, 2026. You keep Pro until then.");
    expect(line).not.toContain("Renews");
  });

  it("describes an active subscription by its renewal date", () => {
    expect(describeSubscription(subscription(), "en-US", "UTC")).toBe("Renews September 3, 2026.");
  });

  it("names a trial as a trial", () => {
    expect(describeSubscription(subscription({ status: "trialing" }), "en-US", "UTC")).toBe(
      "Free trial, then renews September 3, 2026."
    );
  });

  it("degrades gracefully when Stripe gives us no period end", () => {
    expect(
      describeSubscription(subscription({ current_period_end: null }), "en-US", "UTC")
    ).toBe("Active.");
    expect(
      describeSubscription(
        subscription({ cancel_at_period_end: true, current_period_end: null }),
        "en-US",
        "UTC"
      )
    ).toBe("Cancels at the end of this billing period.");
  });

  it("says nothing for a subscription that is already over", () => {
    expect(describeSubscription(subscription({ status: "canceled" }), "en-US", "UTC")).toBeNull();
  });
});
