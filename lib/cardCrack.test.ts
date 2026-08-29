import { describe, expect, it } from "vitest";
import {
  buildCardCrack,
  countSentences,
  enforceReceipts,
  levelFor,
  RECOVERY_XP,
  verifyQuote,
} from "@/lib/cardCrack";

const MATERIAL =
  "If a dynamic equilibrium is disturbed by changing conditions, the position of equilibrium moves to counteract the change. Increasing pressure shifts the system toward the side with fewer moles of gas.";

describe("verifyQuote", () => {
  it("accepts a verbatim quote", () => {
    expect(
      verifyQuote(
        "the position of equilibrium moves to counteract the change",
        MATERIAL
      )
    ).toBe(true);
  });

  it("accepts a quote that only differs by reflowed whitespace", () => {
    // A model unwrapping a PDF line break is not a fabrication.
    expect(
      verifyQuote("the position of equilibrium\n  moves to   counteract the change", MATERIAL)
    ).toBe(true);
  });

  it("accepts curly quotes and en-dashes from a PDF", () => {
    const src = "The rate—determining step is the slowest step in the mechanism.";
    expect(verifyQuote("The rate-determining step is the slowest step", src)).toBe(true);
  });

  it("rejects a paraphrase", () => {
    expect(
      verifyQuote("equilibrium shifts to oppose whatever you changed", MATERIAL)
    ).toBe(false);
  });

  it("rejects an invented quote", () => {
    expect(verifyQuote("Catalysts shift the position of equilibrium.", MATERIAL)).toBe(false);
  });

  it("rejects a snippet too short to be evidence", () => {
    expect(verifyQuote("the", MATERIAL)).toBe(false);
    expect(verifyQuote("", MATERIAL)).toBe(false);
  });
});

describe("enforceReceipts", () => {
  const items = [
    { concept_id: "a", source_quote: "the position of equilibrium moves to counteract the change" },
    { concept_id: "b", source_quote: "Catalysts shift the position of equilibrium." },
    { concept_id: "c" },
  ];

  it("keeps only concepts whose quote is really in the material", () => {
    const { grounded } = enforceReceipts(items, MATERIAL);
    expect(grounded.map((g) => g.concept_id)).toEqual(["a"]);
  });

  it("reports why each rejection happened rather than filtering silently", () => {
    // A silently-filtered list hides a degrading pipeline until a student
    // notices for you.
    const { rejected } = enforceReceipts(items, MATERIAL);
    expect(rejected).toHaveLength(2);
    expect(rejected.map((r) => r.reason)).toEqual([
      "quote not found in source material",
      "no source_quote",
    ]);
  });

  it("handles empty input", () => {
    expect(enforceReceipts([], MATERIAL)).toEqual({ grounded: [], rejected: [] });
  });
});

describe("countSentences", () => {
  it("counts sentences the way a reader would", () => {
    expect(countSentences("One thing. Two things.")).toBe(2);
    expect(countSentences("Just one")).toBe(1);
    expect(countSentences("")).toBe(0);
    expect(countSentences("Really? Yes! Fine.")).toBe(3);
  });
});

describe("buildCardCrack", () => {
  const fallback = {
    topic: "Equilibrium",
    correctAnswer: "To the right, toward the products",
    selectedAnswer: "To the left, toward the reactants",
  };

  it("uses the model's fields when present", () => {
    const result = buildCardCrack(
      {
        misconception: "You assumed pressure favours more molecules.",
        underlying_idea: "Pressure shifts toward fewer moles.",
        how_to_spot: "Count the coefficients on both sides.",
        socratic_loop: "What happens if pressure drops instead?",
      },
      fallback
    );
    expect(result.misconception).toBe("You assumed pressure favours more molecules.");
    expect(result.socratic_loop).toBe("What happens if pressure drops instead?");
  });

  it("caps underlying_idea at two sentences", () => {
    const result = buildCardCrack(
      {
        underlying_idea:
          "First sentence here. Second sentence here. Third sentence should be cut. Fourth too.",
      },
      fallback
    );
    expect(countSentences(result.underlying_idea)).toBeLessThanOrEqual(2);
    expect(result.underlying_idea).not.toContain("Third sentence");
  });

  it("always returns all four fields, even from nothing", () => {
    // A student who just got something wrong must always be told something.
    for (const junk of [null, undefined, {}, "broken", 42, []]) {
      const result = buildCardCrack(junk, fallback);
      expect(result.misconception.length).toBeGreaterThan(10);
      expect(result.underlying_idea.length).toBeGreaterThan(10);
      expect(result.how_to_spot.length).toBeGreaterThan(10);
      expect(result.socratic_loop.length).toBeGreaterThan(10);
    }
  });

  it("names the option the student actually picked in the fallback", () => {
    const result = buildCardCrack({}, fallback);
    expect(result.misconception).toContain(fallback.selectedAnswer);
  });

  it("survives a missing topic without printing undefined", () => {
    const result = buildCardCrack({}, { ...fallback, topic: "" });
    expect(result.how_to_spot).toContain("this topic");
    expect(JSON.stringify(result)).not.toMatch(/undefined|null/);
  });

  it("pays the recovery XP the brief specifies", () => {
    expect(RECOVERY_XP).toBe(30);
  });
});

describe("levelFor", () => {
  it("starts everyone at Novice", () => {
    expect(levelFor({ repetitions: 0, masteryPercent: 0 })).toBe(1);
  });

  it("climbs to Intermediate then Mastery as recall is demonstrated", () => {
    expect(levelFor({ repetitions: 2, masteryPercent: 60 })).toBe(2);
    expect(levelFor({ repetitions: 5, masteryPercent: 85 })).toBe(3);
  });

  it("does not escalate a student who keeps failing", () => {
    // SM-2 repetitions only rise on success, so a struggling student stays
    // on multiple choice instead of being handed open-response questions.
    expect(levelFor({ repetitions: 0, masteryPercent: 95 })).toBe(1);
    expect(levelFor({ repetitions: 8, masteryPercent: 30 })).toBe(1);
  });

  it("returns a valid level for any input", () => {
    for (const reps of [-5, 0, 3, 99]) {
      for (const m of [-10, 0, 50, 100, 500]) {
        const l = levelFor({ repetitions: reps, masteryPercent: m });
        expect([1, 2, 3]).toContain(l);
      }
    }
  });
});
