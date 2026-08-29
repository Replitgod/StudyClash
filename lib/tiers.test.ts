import { describe, expect, it } from "vitest";
import {
  cardsAllowed,
  evaluateRequest,
  PUBLIC_TIERS,
  resolveTier,
  TIERS,
} from "@/lib/tiers";

describe("tier catalogue", () => {
  it("prices Pro at $9.99/month and Classroom at $199/year", () => {
    expect(TIERS.pro.price).toBe("$9.99");
    expect(TIERS.pro.amountCents).toBe(999);
    expect(TIERS.classroom.price).toBe("$199");
    expect(TIERS.classroom.amountCents).toBe(19900);
  });

  it("keeps the displayed price and the charged amount in step", () => {
    // The whole reason both live in one object: a price on the marketing
    // page that does not match what Stripe charges is a refund request.
    for (const tier of PUBLIC_TIERS) {
      const shown = Number(tier.price.replace(/[^0-9.]/g, ""));
      expect(Math.round(shown * 100)).toBe(tier.amountCents);
    }
  });

  it("caps the free tier where the brief says", () => {
    expect(TIERS.free.monthlyMapCap).toBe(3);
    expect(TIERS.free.cardsPerConceptCap).toBe(5);
    expect(TIERS.free.cardCrack).toBe(false);
  });

  it("gives Classroom everything Pro has", () => {
    const flags = [
      "cardCrack",
      "priorityProcessing",
      "advancedIngestion",
      "customThemes",
    ] as const;
    for (const flag of flags) {
      expect(TIERS.classroom[flag], flag).toBe(true);
    }
    expect(TIERS.classroom.collaborative).toBe(true);
    expect(TIERS.pro.collaborative).toBe(false);
  });

  it("resolves unknown or missing tiers to free rather than throwing", () => {
    expect(resolveTier(null).id).toBe("free");
    expect(resolveTier("enterprise").id).toBe("free");
    expect(resolveTier("pro").id).toBe("pro");
  });
});

describe("evaluateRequest", () => {
  const fresh = { mapsThisMonth: 0 };

  it("allows a free user their first maps", () => {
    const d = evaluateRequest({ tier: "free", action: "create_map", usage: fresh });
    expect(d.actionAllowed).toBe(true);
    expect(d.limitEnforced).toBe(false);
    expect(d.mapsRemaining).toBe(3);
  });

  it("blocks a free user at the cap, with a reason a student can read", () => {
    const d = evaluateRequest({
      tier: "free",
      action: "create_map",
      usage: { mapsThisMonth: 3 },
    });
    expect(d.actionAllowed).toBe(false);
    expect(d.limitEnforced).toBe(true);
    expect(d.mapsRemaining).toBe(0);
    // A refusal that cannot explain itself is indistinguishable from a bug.
    expect(d.reason).toMatch(/knowledge maps this month/i);
    expect(d.upgradeUnlocks).toBe(true);
  });

  it("never reports negative maps remaining if usage overshoots", () => {
    const d = evaluateRequest({
      tier: "free",
      action: "create_map",
      usage: { mapsThisMonth: 99 },
    });
    expect(d.mapsRemaining).toBe(0);
  });

  it("does not cap a paid tier", () => {
    for (const tier of ["pro", "classroom"] as const) {
      const d = evaluateRequest({
        tier,
        action: "create_map",
        usage: { mapsThisMonth: 500 },
      });
      expect(d.actionAllowed, tier).toBe(true);
      expect(d.mapsRemaining, tier).toBeNull();
    }
  });

  it("gates Card Crack, advanced ingestion and themes behind Pro", () => {
    for (const action of ["card_crack", "advanced_ingest", "set_theme"] as const) {
      const free = evaluateRequest({ tier: "free", action, usage: fresh });
      expect(free.actionAllowed, action).toBe(false);
      expect(free.reason, action).toBeTruthy();

      const pro = evaluateRequest({ tier: "pro", action, usage: fresh });
      expect(pro.actionAllowed, action).toBe(true);
    }
  });

  it("bands token weight so the expensive paths are identifiable", () => {
    expect(
      evaluateRequest({ tier: "pro", action: "create_map", usage: fresh })
        .calculatedTokenWeight
    ).toBe("high");
    expect(
      evaluateRequest({ tier: "pro", action: "set_theme", usage: fresh })
        .calculatedTokenWeight
    ).toBe("low");
  });

  it("treats a corrupt usage payload as zero rather than crashing", () => {
    const d = evaluateRequest({
      tier: "free",
      action: "create_map",
      usage: { mapsThisMonth: Number.NaN },
    });
    expect(d.actionAllowed).toBe(true);
    expect(d.mapsRemaining).toBe(3);
  });

  it("always reports the tier it actually evaluated", () => {
    expect(
      evaluateRequest({ tier: "nonsense", action: "create_map", usage: fresh }).currentTier
    ).toBe("free");
  });
});

describe("cardsAllowed", () => {
  it("caps the free tier at five cards per concept", () => {
    expect(cardsAllowed("free", 20)).toBe(5);
    expect(cardsAllowed("free", 3)).toBe(3);
  });

  it("does not cap paid tiers", () => {
    expect(cardsAllowed("pro", 40)).toBe(40);
    expect(cardsAllowed("classroom", 40)).toBe(40);
  });

  it("always returns at least one card", () => {
    for (const n of [0, -5, Number.NaN]) {
      expect(cardsAllowed("pro", n)).toBeGreaterThanOrEqual(1);
    }
  });
});
