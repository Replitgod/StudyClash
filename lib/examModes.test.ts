import { describe, expect, it } from "vitest";
import { parseExamBlueprint } from "./examBlueprint";
import {
  describeMode,
  describeModes,
  describeSections,
  describeStructure,
  hasScheduledBreak,
  isAdaptive,
} from "./examModes";

const SAT = parseExamBlueprint({
  sections: [
    {
      key: "reading_writing",
      label: "Reading and Writing",
      modules: [
        { module: 1, questions: 27, minutes: 32 },
        { module: 2, questions: 27, minutes: 32 },
      ],
      quick: { questions: 14, minutes: 18 },
      score: { min: 200, max: 800, step: 10 },
    },
    {
      key: "math",
      label: "Math",
      modules: [
        { module: 1, questions: 22, minutes: 35 },
        { module: 2, questions: 22, minutes: 35 },
      ],
      quick: { questions: 10, minutes: 18 },
      score: { min: 200, max: 800, step: 10 },
    },
  ],
  breakMinutesBetweenSections: 10,
  composite: { kind: "sum" },
});

const NCLEX = parseExamBlueprint({
  sections: [
    {
      key: "nclex_rn",
      label: "NCLEX-RN Practice",
      modules: [{ module: 1, questions: 85, minutes: 120 }],
      quick: { questions: 25, minutes: 35 },
    },
  ],
  breakMinutesBetweenSections: 0,
  composite: { kind: "none" },
});

describe("what an exam is shaped like", () => {
  // The chooser told every student they were getting "the complete
  // four-module structure with adaptive Module 2 routing and a scheduled
  // break". That is the Digital SAT. Three of the five exams are not it.
  it("only claims adaptive routing on an exam that has it", () => {
    expect(isAdaptive(SAT)).toBe(true);
    expect(isAdaptive(NCLEX)).toBe(false);
  });

  it("only claims a break when there is more than one section", () => {
    expect(hasScheduledBreak(SAT)).toBe(true);
    expect(hasScheduledBreak(NCLEX)).toBe(false);
  });

  it("describes each exam as itself", () => {
    expect(describeStructure(SAT)).toBe(
      "2 sections, with a second module chosen from how the first goes, and a 10-minute break."
    );
    expect(describeStructure(NCLEX)).toBe("One section.");
  });
});

describe("what the bank can actually serve", () => {
  it("reports the configured amount when supply is plentiful", () => {
    const full = describeMode(SAT, { reading_writing: 200, math: 200 }, "full");

    expect(full.configured).toBe(98); // 27+27 and 22+22
    expect(full.questions).toBe(98);
    expect(full.short).toBe(false);
    expect(full.offered).toBe(true);
    expect(full.minutes).toBe(134);
  });

  it("quick mode samples one module per section, not all of them", () => {
    const quick = describeMode(SAT, { reading_writing: 200, math: 200 }, "quick");
    expect(quick.configured).toBe(24); // 14 + 10
    expect(quick.minutes).toBe(36);
  });

  // The live case that prompted this. The ACT blueprint asks for 50 English
  // questions; the bank holds 20. The engine already served 20 -- the screen
  // was the part still promising 50.
  it("reports the real number when the bank is short", () => {
    const short = describeMode(SAT, { reading_writing: 20, math: 200 }, "full");

    expect(short.configured).toBe(98);
    expect(short.questions).toBe(64); // 20 of 54, plus all 44 Math
    expect(short.short).toBe(true);
  });

  // A student serving half a section's questions should not sit in front of
  // a timer built for twice as many.
  it("scales the time limit to the questions actually served", () => {
    const full = describeMode(NCLEX, { nclex_rn: 57 }, "full");
    expect(full.questions).toBe(57);
    expect(full.minutes).toBeLessThan(120);
    expect(full.minutes).toBeGreaterThan(60);
  });

  describe("withholding a mode rather than under-delivering it", () => {
    // Serving an eighth of a "Full Diagnostic" teaches a student that the
    // label means nothing.
    it("does not offer a mode the bank cannot mostly fill", () => {
      const starved = describeMode(SAT, { reading_writing: 7, math: 0 }, "full");
      expect(starved.offered).toBe(false);
    });

    it("offers a mode the bank can mostly fill", () => {
      const most = describeMode(NCLEX, { nclex_rn: 60 }, "full");
      expect(most.questions).toBe(60);
      expect(most.offered).toBe(true);
      expect(most.short).toBe(true);
    });

    // A "quick diagnostic" of four questions estimates nothing, however
    // healthy the ratio looks.
    it("never offers a mode of only a handful of questions", () => {
      const tiny = parseExamBlueprint({
        sections: [{ key: "solo", modules: [{ module: 1, questions: 4, minutes: 5 }] }],
      });
      expect(describeMode(tiny, { solo: 4 }, "full").offered).toBe(false);
    });

    it("offers nothing at all when the bank is empty", () => {
      for (const mode of describeModes(SAT, {})) {
        expect({ mode: mode.mode, offered: mode.offered }).toEqual({
          mode: mode.mode,
          offered: false,
        });
      }
    });
  });

  it("treats a missing or negative count as nothing, not as a crash", () => {
    const missing = describeMode(SAT, { reading_writing: -5 }, "quick");
    expect(missing.questions).toBe(0);
    expect(missing.offered).toBe(false);
  });
});

describe("the section list", () => {
  it("names each section and what is behind it", () => {
    expect(describeSections(SAT, { reading_writing: 54, math: 44 })).toEqual([
      { key: "reading_writing", label: "Reading and Writing", available: 54, minutes: 64 },
      { key: "math", label: "Math", available: 44, minutes: 70 },
    ]);
  });

  it("reports zero for a section with no questions rather than omitting it", () => {
    const sections = describeSections(SAT, { reading_writing: 54 });
    expect(sections.map((s) => s.available)).toEqual([54, 0]);
  });
});
