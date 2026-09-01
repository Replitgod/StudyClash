import { describe, expect, it } from "vitest";
import {
  annualSaving,
  cardsAllowed,
  evaluateRequest,
  formatCents,
  getTierPrice,
  hasIntervalChoice,
  includedInProLabel,
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

describe("includedInProLabel", () => {
  it("quotes the price the billing governor actually enforces", () => {
    // Guards the failure this replaced: nine exam cards hardcoded "$3/mo"
    // while TIERS.pro.amountCents was 999.
    const label = includedInProLabel();
    expect(label).toContain(TIERS.pro.price);
    expect(label).toContain(TIERS.pro.label);
    expect(label).not.toContain("$3");
  });

  it("stays consistent with the amount charged in cents", () => {
    const dollars = Number(TIERS.pro.price.replace(/[^0-9.]/g, ""));
    expect(Math.round(dollars * 100)).toBe(TIERS.pro.amountCents);
  });
});

describe("billing intervals", () => {
  it("sells Ace Pro on both a monthly and a yearly price", () => {
    expect(hasIntervalChoice(TIERS.pro)).toBe(true);
    expect(getTierPrice(TIERS.pro, "month")?.amountCents).toBe(999);
    expect(getTierPrice(TIERS.pro, "year")?.amountCents).toBe(9900);
  });

  it("offers no interval choice on tiers sold one way", () => {
    expect(hasIntervalChoice(TIERS.free)).toBe(false);
    expect(hasIntervalChoice(TIERS.classroom)).toBe(false);
    expect(getTierPrice(TIERS.classroom, "month")).toBeNull();
  });

  it("keeps every price's display string in step with its cent amount", () => {
    // The drift this catches is the one that already happened once: a
    // displayed price that no longer matches what Stripe charges.
    for (const tier of PUBLIC_TIERS) {
      for (const price of tier.prices) {
        expect(price.price, `${tier.id}/${price.interval}`).toBe(
          formatCents(price.amountCents)
        );
      }
    }
  });

  it("names an env var for every purchasable price", () => {
    for (const tier of PUBLIC_TIERS) {
      for (const price of tier.prices) {
        expect(price.stripePriceEnvVar).toMatch(/^STRIPE_[A-Z_]+_PRICE_ID$/);
      }
    }
  });

  it("computes the annual saving from the amounts rather than a claim", () => {
    const saving = annualSaving(TIERS.pro);
    expect(saving).not.toBeNull();
    // $9.99 x 12 = $119.88 against $99.
    expect(saving?.amountCents).toBe(2088);
    expect(saving?.percent).toBe(17);
    expect(saving?.monthsFree).toBe(2);
  });

  it("rounds the saving down so the claim is never overstated", () => {
    const saving = annualSaving({
      ...TIERS.pro,
      prices: [
        { ...getTierPrice(TIERS.pro, "month")!, amountCents: 1000 },
        { ...getTierPrice(TIERS.pro, "year")!, amountCents: 10999 },
      ],
    });
    // 12000 - 10999 = 1001 -> 8.34%, and 1.001 months. Both floor.
    expect(saving?.percent).toBe(8);
    expect(saving?.monthsFree).toBe(1);
  });

  it("reports no saving when a yearly price is not actually cheaper", () => {
    const noDiscount = annualSaving({
      ...TIERS.pro,
      prices: [
        { ...getTierPrice(TIERS.pro, "month")!, amountCents: 999 },
        { ...getTierPrice(TIERS.pro, "year")!, amountCents: 11988 },
      ],
    });
    expect(noDiscount).toBeNull();
  });

  it("has no interval choice, so no saving, on a single-price tier", () => {
    expect(annualSaving(TIERS.classroom)).toBeNull();
    expect(annualSaving(TIERS.free)).toBeNull();
  });
});

describe("formatCents", () => {
  it("drops a trailing .00 and keeps real cents", () => {
    expect(formatCents(9900)).toBe("$99");
    expect(formatCents(999)).toBe("$9.99");
    expect(formatCents(2088)).toBe("$20.88");
    expect(formatCents(0)).toBe("$0");
  });
});
