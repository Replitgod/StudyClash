import { describe, expect, it } from "vitest";
import {
  INACTIVITY_TIMEOUT_MS,
  STALE_SESSION_MS,
  evaluateVoiceBudget,
  voiceBudgetFor,
} from "./budget";

describe("voiceBudgetFor", () => {
  it("gives a paid plan more calling time than a free one", () => {
    expect(voiceBudgetFor("pro").dailyMinutes).toBeGreaterThan(
      voiceBudgetFor("free").dailyMinutes
    );
  });

  it("treats an unknown or missing plan as free", () => {
    expect(voiceBudgetFor(null)).toEqual(voiceBudgetFor("free"));
    expect(voiceBudgetFor("nonsense_plan")).toEqual(voiceBudgetFor("free"));
  });

  it("caps a single call even where the daily budget is large", () => {
    const pro = voiceBudgetFor("pro");
    expect(pro.maxCallMinutes).toBeLessThan(pro.dailyMinutes);
  });
});

describe("evaluateVoiceBudget", () => {
  it("allows a fresh call and caps it at the per-call ceiling", () => {
    const decision = evaluateVoiceBudget({ planId: "free", minutesUsedToday: 0 });
    expect(decision.allowed).toBe(true);
    expect(decision.maxCallMs).toBe(voiceBudgetFor("free").maxCallMinutes * 60_000);
    expect(decision.reason).toBeNull();
  });

  // The important behavior: a student with four minutes left gets a
  // four-minute call, not a locked door.
  it("shortens the call rather than refusing when the budget is nearly spent", () => {
    const decision = evaluateVoiceBudget({ planId: "free", minutesUsedToday: 16 });
    expect(decision.allowed).toBe(true);
    expect(decision.maxCallMs).toBe(4 * 60_000);
  });

  it("refuses once the day is spent, and says when it comes back", () => {
    const decision = evaluateVoiceBudget({ planId: "free", minutesUsedToday: 20 });
    expect(decision.allowed).toBe(false);
    expect(decision.maxCallMs).toBe(0);
    expect(decision.reason).toMatch(/resets/i);
    // And points at the thing that still works.
    expect(decision.reason).toMatch(/chat/i);
  });

  it("does not mint a session for a sliver of budget", () => {
    const decision = evaluateVoiceBudget({ planId: "free", minutesUsedToday: 19.7 });
    expect(decision.allowed).toBe(false);
  });

  it("ignores a negative usage figure rather than granting extra time", () => {
    const decision = evaluateVoiceBudget({ planId: "free", minutesUsedToday: -100 });
    expect(decision.remainingMinutes).toBe(voiceBudgetFor("free").dailyMinutes);
  });

  it("never returns a call longer than what is left", () => {
    for (const used of [0, 5, 10, 15, 19]) {
      const decision = evaluateVoiceBudget({ planId: "free", minutesUsedToday: used });
      expect(decision.maxCallMs / 60_000).toBeLessThanOrEqual(decision.remainingMinutes);
    }
  });
});

describe("timeouts", () => {
  it("gives a student long enough to think before hanging up on them", () => {
    expect(INACTIVITY_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("sweeps stale sessions only after any real call could have finished", () => {
    const longest = voiceBudgetFor("pro").maxCallMinutes * 60_000;
    expect(STALE_SESSION_MS).toBeGreaterThan(longest + INACTIVITY_TIMEOUT_MS);
  });
});
