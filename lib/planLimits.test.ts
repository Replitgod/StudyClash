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
    expect(FREE_PLAN_LIMIT_SUMMARY.toLowerCase()).toContain("unlimited");
  });

  it("short copy describes everything as unlimited", () => {
    expect(FREE_PLAN_LIMIT_SHORT.toLowerCase()).toContain("unlimited");
  });

  it("no copy mentions a numeric daily cap", () => {
    expect(FREE_PLAN_LIMIT_SUMMARY).not.toMatch(/\d+\s*(deck|pdf|per day)/i);
    expect(FREE_PLAN_LIMIT_SHORT).not.toMatch(/\d/);
  });
});
