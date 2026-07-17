import { describe, expect, it } from "vitest";
import {
  FREE_DAILY_BATTLE_CAP,
  FREE_DAILY_PDF_CAP,
  FREE_PLAN_LIMIT_SHORT,
  FREE_PLAN_LIMIT_SUMMARY,
} from "./planLimits";

// These guard against copy silently drifting from the numbers actually
// enforced in app/api/generate-questions/route.ts -- the whole reason this
// module exists is a bug where the two had already drifted once before.
describe("plan limit copy", () => {
  it("summary copy states the exact enforced battle cap", () => {
    expect(FREE_PLAN_LIMIT_SUMMARY).toContain(String(FREE_DAILY_BATTLE_CAP));
  });

  it("summary copy states the exact enforced PDF cap", () => {
    expect(FREE_PLAN_LIMIT_SUMMARY).toContain(String(FREE_DAILY_PDF_CAP));
  });

  it("summary describes generation being gated, not battle play itself", () => {
    expect(FREE_PLAN_LIMIT_SUMMARY.toLowerCase()).toContain("generate new decks");
  });

  it("short copy states the exact enforced battle cap", () => {
    expect(FREE_PLAN_LIMIT_SHORT).toContain(String(FREE_DAILY_BATTLE_CAP));
  });
});
