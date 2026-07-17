import { describe, expect, it } from "vitest";
import {
  FREE_DAILY_GENERATION_CAP,
  FREE_DAILY_PDF_CAP,
  FREE_PLAN_LIMIT_SHORT,
  FREE_PLAN_LIMIT_SUMMARY,
} from "./planLimits";

// These guard against copy silently drifting from the numbers actually
// enforced in app/api/generate-questions/route.ts -- the whole reason this
// module exists is a bug where the two had already drifted once before.
describe("plan limit copy", () => {
  it("summary copy states the exact enforced generation cap", () => {
    expect(FREE_PLAN_LIMIT_SUMMARY).toContain(String(FREE_DAILY_GENERATION_CAP));
  });

  it("summary copy states the exact enforced PDF cap", () => {
    expect(FREE_PLAN_LIMIT_SUMMARY).toContain(String(FREE_DAILY_PDF_CAP));
  });

  it("summary describes generation being limited, with battles explicitly unlimited", () => {
    expect(FREE_PLAN_LIMIT_SUMMARY.toLowerCase()).toContain("deck generations");
    expect(FREE_PLAN_LIMIT_SUMMARY.toLowerCase()).toContain("unlimited battles");
  });

  it("short copy states the exact enforced generation cap", () => {
    expect(FREE_PLAN_LIMIT_SHORT).toContain(String(FREE_DAILY_GENERATION_CAP));
  });

  it("short copy does not describe battles as limited", () => {
    expect(FREE_PLAN_LIMIT_SHORT.toLowerCase()).toContain("unlimited battles");
  });
});
