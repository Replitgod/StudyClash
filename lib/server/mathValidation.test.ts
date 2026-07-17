import { describe, expect, it } from "vitest";
import { hasUnbalancedMathDelimiters } from "./mathValidation";

describe("hasUnbalancedMathDelimiters", () => {
  it("passes plain text with no math", () => {
    expect(hasUnbalancedMathDelimiters("What is the capital of France?")).toBe(false);
  });

  it("passes balanced inline math", () => {
    expect(hasUnbalancedMathDelimiters("Solve for $x$ in $x + 2 = 5$.")).toBe(false);
  });

  it("passes balanced display math", () => {
    expect(hasUnbalancedMathDelimiters("The formula is $$x^2 + y^2 = z^2$$ here.")).toBe(false);
  });

  it("passes text with both inline and display math", () => {
    expect(hasUnbalancedMathDelimiters("Given $a=1$, compute $$a^2 + 1$$.")).toBe(false);
  });

  it("flags a dropped closing inline delimiter", () => {
    expect(hasUnbalancedMathDelimiters("Solve for $x in x + 2 = 5.")).toBe(true);
  });

  it("flags an odd number of dollar signs", () => {
    expect(hasUnbalancedMathDelimiters("$a$ and $b")).toBe(true);
  });

  it("flags an unclosed display block", () => {
    expect(hasUnbalancedMathDelimiters("The formula is $$x^2 + y^2 = z^2 here.")).toBe(true);
  });

  it("does not false-positive on a literal price with two dollar signs", () => {
    expect(hasUnbalancedMathDelimiters("It costs $5 and $10 respectively.")).toBe(false);
  });
});
