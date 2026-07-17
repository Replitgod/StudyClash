import { describe, expect, it } from "vitest";
import { shuffleAnswerChoices } from "./questionShuffle";

describe("shuffleAnswerChoices", () => {
  it("returns the same set of choices, just reordered", () => {
    const original = ["A", "B", "C", "D"];
    const shuffled = shuffleAnswerChoices(original);
    expect(shuffled.slice().sort()).toEqual(original.slice().sort());
    expect(shuffled).toHaveLength(4);
  });

  it("does not mutate the input array", () => {
    const original = ["A", "B", "C", "D"];
    const originalCopy = [...original];
    shuffleAnswerChoices(original);
    expect(original).toEqual(originalCopy);
  });

  it("does not always return the same order (statistically), so correct_answer position is not predictable", () => {
    const original = ["A", "B", "C", "D"];
    const orders = new Set<string>();
    for (let i = 0; i < 50; i++) {
      orders.add(shuffleAnswerChoices(original).join(","));
    }
    // With 4! = 24 possible orderings and 50 draws, seeing only 1 unique
    // order would mean the shuffle isn't actually shuffling.
    expect(orders.size).toBeGreaterThan(1);
  });

  it("handles a 2-element array (true/false) without throwing", () => {
    expect(shuffleAnswerChoices(["True", "False"]).sort()).toEqual(["False", "True"]);
  });

  it("handles an empty array", () => {
    expect(shuffleAnswerChoices([])).toEqual([]);
  });
});
