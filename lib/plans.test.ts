import { describe, expect, it } from "vitest";
import {
  ALL_PLANS,
  FREE_PLAN_IDS,
  getPlanMetadata,
  isKnownPlanId,
  PRIORITY_PLAN_IDS,
  PUBLIC_PLANS,
} from "./plans";

// This module exists specifically because /api/generate-questions once
// hardcoded its own plan-id allowlist that drifted from the /pricing cards
// (pro_preview and founder were valid to the API but invisible on pricing).
// These tests guard against that class of drift recurring.
describe("plan metadata", () => {
  it("every plan is exactly one of free or priority tier, never both or neither", () => {
    for (const plan of ALL_PLANS) {
      const inFree = FREE_PLAN_IDS.has(plan.id);
      const inPriority = PRIORITY_PLAN_IDS.has(plan.id);
      expect(inFree).toBe(plan.tier === "free");
      expect(inPriority).toBe(plan.tier === "priority");
    }
  });

  it("only publiclyListed plans appear in PUBLIC_PLANS", () => {
    expect(PUBLIC_PLANS.every((plan) => plan.publiclyListed)).toBe(true);
    expect(PUBLIC_PLANS.length).toBeLessThan(ALL_PLANS.length);
  });

  it("getPlanMetadata resolves a known plan id", () => {
    expect(getPlanMetadata("free_beta")?.label).toBe("Free");
  });

  it("getPlanMetadata returns null for an unknown or missing plan id", () => {
    expect(getPlanMetadata("not_a_real_plan")).toBeNull();
    expect(getPlanMetadata(null)).toBeNull();
    expect(getPlanMetadata(undefined)).toBeNull();
  });

  it("isKnownPlanId agrees with getPlanMetadata on every real plan id", () => {
    for (const plan of ALL_PLANS) {
      expect(isKnownPlanId(plan.id)).toBe(true);
    }
    expect(isKnownPlanId("not_a_real_plan")).toBe(false);
  });
});
