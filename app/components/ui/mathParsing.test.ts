import { describe, expect, it } from "vitest";
import { hasMath, splitMathSegments } from "./mathParsing";

// This decides whether a screen downloads KaTeX at all, so a false positive
// costs every reader a large chunk they did not need, and a false negative
// renders raw LaTeX at a student mid-question.

describe("splitMathSegments", () => {
  it("passes plain prose through as a single text segment", () => {
    const segments = splitMathSegments("Who signed the Treaty of Versailles?");
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe("text");
    expect(hasMath(segments)).toBe(false);
  });

  it("finds inline math", () => {
    const segments = splitMathSegments("Solve $x^2 + 1$ for x.");
    expect(hasMath(segments)).toBe(true);
    expect(segments.map((s) => s.type)).toEqual(["text", "math", "text"]);
    expect(segments[1]).toMatchObject({ content: "x^2 + 1", display: false });
  });

  it("reads $$ as display math, not two inline delimiters", () => {
    const segments = splitMathSegments("$$\frac{a}{b}$$");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: "math", display: true });
  });

  it("handles display and inline math in the same string", () => {
    const segments = splitMathSegments("Given $n > 0$, prove $$\sum_{i=1}^{n} i$$ converges.");
    const math = segments.filter((s) => s.type === "math");
    expect(math).toHaveLength(2);
    expect(math[0]).toMatchObject({ display: false });
    expect(math[1]).toMatchObject({ display: true });
  });

  it("treats a lone dollar sign as prose, not an unterminated formula", () => {
    // Money in a word problem must not trip the LaTeX engine.
    const segments = splitMathSegments("A phone plan costs $20 a month.");
    expect(hasMath(segments)).toBe(false);
  });

  it("does not let inline math span a line break", () => {
    const segments = splitMathSegments("Cost is $20\nand the tax is $2");
    expect(hasMath(segments)).toBe(false);
  });

  it("returns nothing for an empty string", () => {
    expect(splitMathSegments("")).toEqual([]);
    expect(hasMath(splitMathSegments(""))).toBe(false);
  });
});
