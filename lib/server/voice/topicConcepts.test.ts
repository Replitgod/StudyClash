import { describe, expect, it } from "vitest";
import { parseTopicConcepts } from "./topicConcepts";

function concept(label: string, facts = ["fact one", "fact two", "fact three"]) {
  return { label, facts };
}

function outline(count: number) {
  return {
    educational: true,
    concepts: Array.from({ length: count }, (_, i) => concept(`Concept ${i + 1}`)),
  };
}

describe("parseTopicConcepts", () => {
  it("returns concepts in the same shape a deck produces", () => {
    const result = parseTopicConcepts(outline(6));

    expect(result).not.toBeNull();
    expect(result).toHaveLength(6);
    // Positional ids, matching studyContext.ts. The tutoring loop, the tool
    // channel and the summary all assume this shape; a generated session
    // must be indistinguishable from a deck-backed one.
    expect(result!.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6"]);
    expect(result![0].label).toBe("Concept 1");
    expect(result![0].facts).toEqual(["fact one", "fact two", "fact three"]);
  });

  // Nothing generated can be a known weak spot: prior weakness is a fact
  // about the student, and this parser is handed no student.
  it("never marks a generated concept as previously weak", () => {
    const result = parseTopicConcepts({
      concepts: [{ label: "Glycolysis", facts: ["a", "b"], priorWeak: true }],
      // Four is the minimum, so pad it out.
      ...{},
    });
    expect(result).toBeNull();

    const padded = parseTopicConcepts(outline(5));
    expect(padded!.every((c) => c.priorWeak === false)).toBe(true);
  });

  describe("refusing what cannot make a lesson", () => {
    it("returns null for an explicit non-educational verdict", () => {
      expect(parseTopicConcepts({ educational: false })).toBeNull();
      // Even when the model contradicts itself and sends concepts anyway.
      expect(parseTopicConcepts({ ...outline(9), educational: false })).toBeNull();
    });

    it("returns null for anything that is not an outline", () => {
      for (const bad of [null, undefined, "concepts", 42, [], {}, { concepts: "no" }]) {
        expect(parseTopicConcepts(bad)).toBeNull();
      }
    });

    it("returns null when too few concepts survive validation", () => {
      expect(parseTopicConcepts(outline(3))).toBeNull();
    });
  });

  describe("dropping bad rows without losing the lesson", () => {
    // Runs mid-call: one malformed concept out of nine should cost that
    // concept, not the whole session.
    it("skips malformed entries and keeps the rest", () => {
      const result = parseTopicConcepts({
        concepts: [
          concept("Good one"),
          null,
          "not an object",
          { label: "", facts: ["a", "b"] },
          concept("Good two"),
          concept("Good three"),
          concept("Good four"),
        ],
      });

      expect(result).toHaveLength(4);
      expect(result!.map((c) => c.label)).toEqual([
        "Good one",
        "Good two",
        "Good three",
        "Good four",
      ]);
      // Ids stay contiguous after the drops, or a tool call referencing "c3"
      // resolves to nothing.
      expect(result!.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    });

    // A concept with one line behind it cannot support a question, a hint
    // and a re-ask, which is the least the hint ladder needs.
    it("drops a concept with fewer than two facts", () => {
      const result = parseTopicConcepts({
        concepts: [
          { label: "Thin", facts: ["only one"] },
          { label: "Empty", facts: [] },
          concept("Full one"),
          concept("Full two"),
          concept("Full three"),
          concept("Full four"),
        ],
      });

      expect(result!.map((c) => c.label)).toEqual([
        "Full one",
        "Full two",
        "Full three",
        "Full four",
      ]);
    });

    // A repeat is a question asked twice in a row, which reads as the tutor
    // losing its place.
    it("drops duplicate labels regardless of case", () => {
      const result = parseTopicConcepts({
        concepts: [
          concept("Glycolysis"),
          concept("glycolysis"),
          concept("GLYCOLYSIS"),
          concept("Krebs cycle"),
          concept("Electron transport"),
          concept("ATP yield"),
        ],
      });

      expect(result!.map((c) => c.label)).toEqual([
        "Glycolysis",
        "Krebs cycle",
        "Electron transport",
        "ATP yield",
      ]);
    });

    it("drops non-string facts rather than passing them to the tutor", () => {
      const result = parseTopicConcepts({
        concepts: [
          { label: "Mixed", facts: ["real fact", null, 42, "another real fact"] },
          concept("Two"),
          concept("Three"),
          concept("Four"),
        ],
      });

      expect(result![0].facts).toEqual(["real fact", "another real fact"]);
    });
  });

  describe("clamping", () => {
    it("caps how many concepts one topic can produce", () => {
      const result = parseTopicConcepts(outline(40));
      expect(result!.length).toBeLessThanOrEqual(14);
    });

    it("caps facts per concept, so one topic cannot fill the context", () => {
      const result = parseTopicConcepts({
        concepts: [
          { label: "Wordy", facts: Array.from({ length: 20 }, (_, i) => `fact ${i}`) },
          concept("Two"),
          concept("Three"),
          concept("Four"),
        ],
      });

      expect(result![0].facts).toHaveLength(6);
    });

    it("truncates a fact that arrived as a passage", () => {
      const long = "x".repeat(900);
      const result = parseTopicConcepts({
        concepts: [
          { label: "Long", facts: [long, "short one"] },
          concept("Two"),
          concept("Three"),
          concept("Four"),
        ],
      });

      expect(result![0].facts[0].length).toBeLessThanOrEqual(321);
      expect(result![0].facts[0].endsWith("…")).toBe(true);
    });

    it("collapses whitespace so a fact stays one spoken line", () => {
      const result = parseTopicConcepts({
        concepts: [
          { label: "  Spaced   out  ", facts: ["line\n\nbreak", "  padded  "] },
          concept("Two"),
          concept("Three"),
          concept("Four"),
        ],
      });

      expect(result![0].label).toBe("Spaced out");
      expect(result![0].facts).toEqual(["line break", "padded"]);
    });
  });
});
