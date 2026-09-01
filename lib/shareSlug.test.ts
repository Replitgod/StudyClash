import { describe, expect, it } from "vitest";
import {
  buildShareSlug,
  buildSuffix,
  isValidShareSlug,
  slugifyTitle,
} from "./shareSlug";

/** Deterministic stand-in for the server's CSPRNG. */
function cyclingRandom(values: number[]): (max: number) => number {
  let i = 0;
  return (max) => values[i++ % values.length] % max;
}

const zeros = () => 0; // always picks "2", the first alphabet character

describe("slugifyTitle", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyTitle("Photosynthesis Basics")).toBe("photosynthesis-basics");
  });

  it("strips accents rather than the letters carrying them", () => {
    // The naive strip turns "Ácido" into "cido", which is a different word.
    expect(slugifyTitle("Ácido Básico")).toBe("acido-basico");
  });

  it("drops punctuation and apostrophes without splitting words", () => {
    expect(slugifyTitle("Ohm's Law")).toBe("ohms-law");
    expect(slugifyTitle("Unit 3: Cells & Energy!")).toBe("unit-3-cells-energy");
  });

  it("drops noise words when others survive", () => {
    expect(slugifyTitle("The Fall of the Roman Empire")).toBe("fall-roman-empire");
  });

  it("keeps noise words when they are all there is", () => {
    // Otherwise a deck genuinely called "The A Team" slugifies to nothing.
    expect(slugifyTitle("The Of And")).toBe("the-of-and");
  });

  it("truncates on a word boundary rather than mid-word", () => {
    const slug = slugifyTitle(
      "Introduction to Advanced Organic Chemistry Reaction Mechanisms and Synthesis"
    );
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
    // Every piece is a whole word from the title.
    for (const part of slug.split("-")) {
      expect("introduction advanced organic chemistry reaction mechanisms synthesis").toContain(part);
    }
  });

  it("still returns something for a single word longer than the cap", () => {
    const slug = slugifyTitle("a".repeat(80));
    expect(slug.length).toBe(48);
  });

  it("returns empty for a title with nothing usable", () => {
    expect(slugifyTitle("🎴🎴🎴")).toBe("");
    expect(slugifyTitle("!!!")).toBe("");
    expect(slugifyTitle("")).toBe("");
  });
});

describe("buildSuffix", () => {
  it("is six characters from the unambiguous alphabet", () => {
    const suffix = buildSuffix(cyclingRandom([0, 1, 2, 3, 4, 5]));
    expect(suffix).toHaveLength(6);
    // No 0/O or 1/l/I, so a slug read aloud or copied by hand survives.
    expect(suffix).not.toMatch(/[01loi]/);
  });
});

describe("buildShareSlug", () => {
  it("joins the readable half to the random half", () => {
    expect(buildShareSlug("Photosynthesis", zeros)).toBe("photosynthesis-222222");
  });

  it("still produces a valid address when the title slugifies to nothing", () => {
    // Publishing must not fail because someone titled their deck in emoji.
    const slug = buildShareSlug("🎴", zeros);
    expect(slug).toBe("set-222222");
    expect(isValidShareSlug(slug)).toBe(true);
    expect(slug.startsWith("-")).toBe(false);
  });

  it("always produces something isValidShareSlug accepts", () => {
    const titles = [
      "Ohm's Law",
      "The Fall of the Roman Empire",
      "Unit 3: Cells & Energy!",
      "Ácido Básico",
      "🎴🎴",
      "",
      "a".repeat(80),
    ];
    for (const title of titles) {
      expect(isValidShareSlug(buildShareSlug(title, zeros)), title).toBe(true);
    }
  });
});

describe("isValidShareSlug", () => {
  it("accepts a real slug", () => {
    expect(isValidShareSlug("photosynthesis-k3f9q2")).toBe(true);
    expect(isValidShareSlug("set-222222")).toBe(true);
  });

  it("rejects path traversal and junk before it reaches the database", () => {
    for (const bad of [
      "../../etc/passwd",
      "photo synthesis",
      "Photosynthesis",
      "-leading",
      "trailing-",
      "double--hyphen",
      "under_score",
      "a".repeat(65),
      "",
      null,
      undefined,
    ]) {
      expect(isValidShareSlug(bad as string), String(bad)).toBe(false);
    }
  });
});
