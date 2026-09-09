import { describe, expect, it } from "vitest";
import {
  balanceQuestion,
  referencedLetters,
  remapExplanation,
  targetLetters,
  verifyRemap,
} from "./keyBalance";

const CHOICES = [
  { id: "A", text: "Ten dollars" },
  { id: "B", text: "Fifteen percent" },
  { id: "C", text: "Seventeen point six percent" },
  { id: "D", text: "Twenty percent" },
];

describe("moving the key", () => {
  it("puts the correct answer where it was asked for", () => {
    const result = balanceQuestion({
      choices: CHOICES,
      correctAnswer: "B",
      explanation: "The reduction is 15 percent.",
      targetLetter: "D",
    });

    expect(result.correctAnswer).toBe("D");
    expect(result.choices.find((c) => c.id === "D")?.text).toBe("Fifteen percent");
    expect(result.moved).toBe(true);
  });

  it("swaps rather than reshuffles, so only two letters change meaning", () => {
    const result = balanceQuestion({
      choices: CHOICES,
      correctAnswer: "B",
      explanation: "x",
      targetLetter: "D",
    });

    // B and D trade places; A and C are untouched.
    expect(result.choices.find((c) => c.id === "B")?.text).toBe("Twenty percent");
    expect(result.choices.find((c) => c.id === "A")?.text).toBe("Ten dollars");
    expect(result.choices.find((c) => c.id === "C")?.text).toBe("Seventeen point six percent");
    expect(result.mapping).toMatchObject({ A: "A", B: "D", C: "C", D: "B" });
  });

  it("keeps every option, just in a different order", () => {
    const result = balanceQuestion({
      choices: CHOICES,
      correctAnswer: "A",
      explanation: "x",
      targetLetter: "C",
    });
    expect([...result.choices.map((c) => c.text)].sort()).toEqual(
      [...CHOICES.map((c) => c.text)].sort()
    );
  });

  it("does nothing when the key is already in place", () => {
    const result = balanceQuestion({
      choices: CHOICES,
      correctAnswer: "B",
      explanation: "unchanged",
      targetLetter: "B",
    });
    expect(result.moved).toBe(false);
    expect(result.choices).toBe(CHOICES);
    expect(result.explanation).toBe("unchanged");
  });

  it("does nothing when asked for a position the question does not have", () => {
    const result = balanceQuestion({
      choices: CHOICES.slice(0, 3),
      correctAnswer: "A",
      explanation: "unchanged",
      targetLetter: "F",
    });
    expect(result.moved).toBe(false);
  });
});

describe("rewriting the letters an explanation cites", () => {
  it("rewrites the phrasings these explanations actually use", () => {
    const map = { A: "C", B: "B", C: "A", D: "D" };
    expect(remapExplanation("Choice A is the dollar amount.", map)).toBe(
      "Choice C is the dollar amount."
    );
    expect(remapExplanation("Option A reports the square.", map)).toBe(
      "Option C reports the square."
    );
    expect(remapExplanation("The answer is A.", map)).toBe("The answer is C.");
    expect(remapExplanation("A inverts the definition.", map)).toBe("C inverts the definition.");
  });

  // Swapping A and B with two sequential replaces turns every A into a B and
  // then every B back into an A, leaving the text unchanged and the
  // explanation silently wrong.
  it("does not double-rewrite a letter that swaps with another", () => {
    const map = { A: "B", B: "A", C: "C", D: "D" };
    expect(remapExplanation("Choice A is short and Choice B is long.", map)).toBe(
      "Choice B is short and Choice A is long."
    );
  });

  // A bare capital letter is far too common in ordinary prose to rewrite on
  // sight, and these explanations are full of sentences starting with "A".
  it("leaves ordinary prose alone", () => {
    const map = { A: "C", B: "B", C: "A", D: "D" };
    expect(remapExplanation("A student who guesses learns nothing.", map)).toBe(
      "A student who guesses learns nothing."
    );
    expect(remapExplanation("A colon introduces the list.", map)).toBe(
      "A colon introduces the list."
    );
  });

  it("finds the letters an explanation talks about", () => {
    expect(referencedLetters("Choice A is wrong, and D comes from squaring.")).toEqual(["A", "D"]);
    expect(referencedLetters("A student answered well.")).toEqual([]);
  });
});

describe("verifying a remap did not change any meaning", () => {
  function run(correctAnswer: string, target: string, explanation: string) {
    const result = balanceQuestion({
      choices: CHOICES,
      correctAnswer,
      explanation,
      targetLetter: target,
    });
    return {
      result,
      check: verifyRemap({
        before: { choices: CHOICES, explanation },
        after: { choices: result.choices, explanation: result.explanation },
        mapping: result.mapping,
      }),
    };
  }

  it("passes when every cited letter still points at the same text", () => {
    const { check } = run("B", "D", "Choice A is the dollar amount and D over-rounds.");
    expect(check.ok).toBe(true);
  });

  it("passes for an explanation that cites nothing", () => {
    const { check } = run("B", "D", "Fifteen percent of eighty is twelve.");
    expect(check.ok).toBe(true);
  });

  // The safety net: if a rewrite ever silently pointed a sentence at the
  // wrong option, this is what catches it and leaves the row alone.
  it("fails when a letter is left pointing at different text", () => {
    const result = balanceQuestion({
      choices: CHOICES,
      correctAnswer: "B",
      explanation: "Choice A is the dollar amount.",
      targetLetter: "D",
    });

    const check = verifyRemap({
      before: { choices: CHOICES, explanation: "Choice A is the dollar amount." },
      // Explanation deliberately left un-remapped, as a buggy rewrite would.
      after: { choices: result.choices, explanation: "Choice D is the dollar amount." },
      mapping: result.mapping,
    });

    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/not the remap of the original/);
  });

  it("fails when the set of choices changed", () => {
    const check = verifyRemap({
      before: { choices: CHOICES, explanation: "x" },
      after: { choices: CHOICES.slice(0, 3), explanation: "x" },
      mapping: { A: "A", B: "B", C: "C", D: "D" },
    });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/set of answer choices/);
  });
});

describe("targetLetters", () => {
  it("spreads targets evenly across the positions", () => {
    expect(targetLetters(8, 4)).toEqual(["A", "B", "C", "D", "A", "B", "C", "D"]);
  });

  it("respects a question with fewer options", () => {
    expect(targetLetters(4, 3)).toEqual(["A", "B", "C", "A"]);
  });
});
