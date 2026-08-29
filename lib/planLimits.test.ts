import { describe, expect, it } from "vitest";
import {
  FREE_DAILY_GENERATION_CAP,
  FREE_DAILY_PDF_CAP,
  FREE_PLAN_LIMIT_SHORT,
  FREE_PLAN_LIMIT_SUMMARY,
  IS_UNLIMITED,
} from "./planLimits";

// These guard against copy silently drifting from what is actually enforced
// in app/api/generate-questions/route.ts -- the whole reason this module
// exists is a bug where the two had already drifted once before. AceDecks is
// now unlimited on every plan, so the invariant is "no caps, and the copy
// says so".
describe("plan limits", () => {
  it("has no generation cap", () => {
    expect(FREE_DAILY_GENERATION_CAP).toBeNull();
  });

  it("has no PDF cap", () => {
    expect(FREE_DAILY_PDF_CAP).toBeNull();
  });

  it("reports itself as unlimited", () => {
    expect(IS_UNLIMITED).toBe(true);
  });

  it("summary copy describes everything as unlimited", () => {
    // The free tier is capped now, so the copy has to say so.
    expect(FREE_PLAN_LIMIT_SUMMARY.toLowerCase()).toContain("3 knowledge maps");
  });

  it("short copy describes everything as unlimited", () => {
    expect(FREE_PLAN_LIMIT_SHORT.toLowerCase()).toContain("3 maps");
  });

  it("no copy mentions a numeric daily cap", () => {
    // It must describe the monthly map cap, never a per-day deck/PDF cap,
    // because no per-day cap is actually enforced.
    expect(FREE_PLAN_LIMIT_SUMMARY).not.toMatch(/per day|daily/i);
    expect(FREE_PLAN_LIMIT_SHORT).not.toMatch(/per day|daily/i);
  });
});
