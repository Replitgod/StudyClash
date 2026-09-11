import { describe, expect, it } from "vitest";
import {
  combineComposite,
  computeRawMarks,
  estimateScoreRange,
  firstSectionKey,
  guessExpectedValue,
  moduleBlueprint,
  moduleCount,
  moduleSize,
  nextSectionKey,
  parseExamBlueprint,
  parseMarking,
  sectionByKey,
  sectionKeys,
  sectionLabel,
} from "./examBlueprint";

// The Digital SAT configuration as it is actually stored, because the first
// duty of this module is to keep reading the one exam that already worked.
const SAT_CONFIG = {
  sections: [
    {
      key: "reading_writing",
      label: "Reading and Writing",
      totalQuestions: 54,
      totalMinutes: 64,
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
      totalQuestions: 44,
      totalMinutes: 70,
      modules: [
        { module: 1, questions: 22, minutes: 35 },
        { module: 2, questions: 22, minutes: 35 },
      ],
      quick: { questions: 10, minutes: 18 },
      score: { min: 200, max: 800, step: 10 },
    },
  ],
  breakMinutesBetweenSections: 10,
  adaptive: { module2ThresholdAccuracy: 0.6 },
  composite: { kind: "sum" },
};

describe("parseExamBlueprint", () => {
  it("reads the Digital SAT configuration as it is stored", () => {
    const blueprint = parseExamBlueprint(SAT_CONFIG);

    expect(sectionKeys(blueprint)).toEqual(["reading_writing", "math"]);
    expect(firstSectionKey(blueprint)).toBe("reading_writing");
    expect(nextSectionKey(blueprint, "reading_writing")).toBe("math");
    expect(nextSectionKey(blueprint, "math")).toBeNull();
    expect(blueprint.breakMinutesBetweenSections).toBe(10);
    expect(blueprint.adaptive.module2ThresholdAccuracy).toBe(0.6);
    expect(blueprint.composite).toEqual({ kind: "sum" });
  });

  // Section order is the order the exam is sat in. Getting it from anywhere
  // other than the array order -- sorting by key, say -- would put Math
  // first on the SAT and the Science section second on the ACT.
  it("keeps sections in configuration order", () => {
    const blueprint = parseExamBlueprint({
      sections: [
        { key: "zebra", modules: [{ module: 1, questions: 5, minutes: 5 }] },
        { key: "alpha", modules: [{ module: 1, questions: 5, minutes: 5 }] },
      ],
    });
    expect(sectionKeys(blueprint)).toEqual(["zebra", "alpha"]);
  });

  describe("surviving a configuration that is wrong", () => {
    // A route that 500s on a bad row turns one bad migration into a broken
    // exam page for everybody.
    it("never returns an exam with no sections", () => {
      for (const bad of [null, undefined, {}, [], "config", { sections: null }, { sections: [] }]) {
        const blueprint = parseExamBlueprint(bad);
        expect(blueprint.sections.length).toBeGreaterThan(0);
        expect(firstSectionKey(blueprint)).toBeTruthy();
      }
    });

    // Every use of a section is a lookup by key, so a keyless section can
    // never be assigned questions, resumed or scored.
    it("drops a section with no key rather than keeping an unusable one", () => {
      const blueprint = parseExamBlueprint({
        sections: [
          { label: "Nameless", modules: [{ module: 1, questions: 5, minutes: 5 }] },
          { key: "math", label: "Math", modules: [{ module: 1, questions: 5, minutes: 5 }] },
        ],
      });
      expect(sectionKeys(blueprint)).toEqual(["math"]);
    });

    it("falls back to a usable module when one is missing or nonsense", () => {
      const blueprint = parseExamBlueprint({
        sections: [{ key: "solo", modules: [{ module: 1, questions: -5, minutes: "soon" }] }],
      });
      const first = moduleBlueprint(blueprint, "solo", 1);
      expect(first.questions).toBeGreaterThan(0);
      expect(first.minutes).toBeGreaterThan(0);
    });

    it("rejects an adaptive threshold that is not a probability", () => {
      for (const threshold of [0, 1, 1.5, -0.2, "high", null]) {
        const blueprint = parseExamBlueprint({
          sections: SAT_CONFIG.sections,
          adaptive: { module2ThresholdAccuracy: threshold },
        });
        expect(blueprint.adaptive.module2ThresholdAccuracy).toBe(0.6);
      }
    });

    it("ignores a score scale whose bounds do not make one", () => {
      const blueprint = parseExamBlueprint({
        sections: [
          { key: "a", modules: [], score: { min: 800, max: 200 } },
          { key: "b", modules: [], score: { min: 1, max: 1 } },
          { key: "c", modules: [], score: "200-800" },
        ],
      });
      expect(blueprint.sections.every((section) => section.score === null)).toBe(true);
    });

    it("renders a readable label when the configuration omits one", () => {
      const blueprint = parseExamBlueprint({
        sections: [{ key: "chem_phys", modules: [] }],
      });
      expect(sectionLabel(blueprint, "chem_phys")).toBe("Chem phys");
      // A key nobody configured still reads as words, not as a database key.
      expect(sectionLabel(blueprint, "not_a_section")).toBe("Not a section");
    });
  });

  describe("the quick sample", () => {
    it("uses the configured sizes when they are given", () => {
      const blueprint = parseExamBlueprint(SAT_CONFIG);
      expect(moduleSize(blueprint, "reading_writing", 1, "quick")).toEqual({
        questions: 14,
        minutes: 18,
      });
    });

    // Deriving rather than defaulting to a round number is what makes
    // adding an exam a migration rather than a migration plus two constants.
    it("derives a sensible size from the real module when absent", () => {
      const blueprint = parseExamBlueprint({
        sections: [{ key: "science", modules: [{ module: 1, questions: 40, minutes: 35 }] }],
      });

      const quick = moduleSize(blueprint, "science", 1, "quick");
      expect(quick.questions).toBe(20);
      // Same pace as the real section: 35 minutes for 40 questions.
      expect(quick.minutes).toBe(18);
    });

    it("never derives a sample too small to measure anything", () => {
      const blueprint = parseExamBlueprint({
        sections: [{ key: "tiny", modules: [{ module: 1, questions: 4, minutes: 2 }] }],
      });
      const quick = moduleSize(blueprint, "tiny", 1, "quick");
      expect(quick.questions).toBeGreaterThanOrEqual(5);
      expect(quick.minutes).toBeGreaterThanOrEqual(5);
    });

    it("serves the full module in full mode", () => {
      const blueprint = parseExamBlueprint(SAT_CONFIG);
      expect(moduleSize(blueprint, "math", 2, "full")).toEqual({ questions: 22, minutes: 35 });
    });
  });

  it("reports how many modules a section runs", () => {
    const blueprint = parseExamBlueprint({
      sections: [
        { key: "adaptive", modules: [{ module: 1, questions: 5, minutes: 5 }, { module: 2, questions: 5, minutes: 5 }] },
        { key: "linear", modules: [{ module: 1, questions: 5, minutes: 5 }] },
      ],
    });
    expect(moduleCount(blueprint, "adaptive")).toBe(2);
    expect(moduleCount(blueprint, "linear")).toBe(1);
  });

  it("returns null rather than guessing for a section that does not exist", () => {
    const blueprint = parseExamBlueprint(SAT_CONFIG);
    expect(sectionByKey(blueprint, "writing")).toBeNull();
    expect(nextSectionKey(blueprint, "writing")).toBeNull();
  });
});

describe("estimateScoreRange", () => {
  const SAT_SCALE = { min: 200, max: 800, step: 10 };

  // The SAT numbers this replaced, reproduced exactly. Center 500, one theta
  // = 100 points, the adaptive path worth 20, the band 70 wide on a quick
  // attempt and 40 on a full one.
  it("reproduces the SAT scale it was generalised from", () => {
    expect(estimateScoreRange({ theta: 0, scale: SAT_SCALE, path: null, mode: "full" })).toEqual({
      low: 460,
      high: 540,
    });
    expect(estimateScoreRange({ theta: 0, scale: SAT_SCALE, path: null, mode: "quick" })).toEqual({
      low: 430,
      high: 570,
    });
    expect(estimateScoreRange({ theta: 1, scale: SAT_SCALE, path: null, mode: "full" })).toEqual({
      low: 560,
      high: 640,
    });
  });

  it("widens the band for a quick attempt, which saw fewer questions", () => {
    const quick = estimateScoreRange({ theta: 0.5, scale: SAT_SCALE, path: null, mode: "quick" });
    const full = estimateScoreRange({ theta: 0.5, scale: SAT_SCALE, path: null, mode: "full" });
    expect(quick.high - quick.low).toBeGreaterThan(full.high - full.low);
  });

  it("moves the estimate with the adaptive path taken", () => {
    const harder = estimateScoreRange({ theta: 0, scale: SAT_SCALE, path: "harder", mode: "full" });
    const easier = estimateScoreRange({ theta: 0, scale: SAT_SCALE, path: "easier", mode: "full" });
    expect(harder.low).toBeGreaterThan(easier.low);
  });

  it("never reports a score outside the exam's own scale", () => {
    const act = { min: 1, max: 36, step: 1 };
    for (const theta of [-9, -3, 0, 3, 9]) {
      const range = estimateScoreRange({ theta, scale: act, path: null, mode: "quick" });
      expect(range.low).toBeGreaterThanOrEqual(1);
      expect(range.high).toBeLessThanOrEqual(36);
      expect(range.low).toBeLessThanOrEqual(range.high);
    }
  });

  it("centers each exam on its own midpoint", () => {
    // MCAT sections run 118-132, so an average performance is 125 and not
    // 500. This is the whole reason the scale is a parameter.
    const mcat = { min: 118, max: 132, step: 1 };
    const range = estimateScoreRange({ theta: 0, scale: mcat, path: null, mode: "full" });
    expect(range.low).toBeLessThanOrEqual(125);
    expect(range.high).toBeGreaterThanOrEqual(125);
  });
});

describe("combineComposite", () => {
  it("adds section ranges for a summed exam", () => {
    const blueprint = parseExamBlueprint(SAT_CONFIG);
    expect(
      combineComposite(blueprint, [
        { low: 460, high: 540 },
        { low: 560, high: 640 },
      ])
    ).toEqual({ low: 1020, high: 1180 });
  });

  it("averages section ranges for an exam scored that way", () => {
    const blueprint = parseExamBlueprint({
      sections: [{ key: "a", modules: [], score: { min: 1, max: 36 } }],
      composite: { kind: "average" },
    });

    expect(
      combineComposite(blueprint, [
        { low: 20, high: 24 },
        { low: 26, high: 30 },
        { low: 22, high: 26 },
        { low: 24, high: 28 },
      ])
    ).toEqual({ low: 23, high: 27 });
  });

  // The NCLEX reports a pass/fail decision and no scaled score. Showing a
  // student "0-0" because the code needed a number is worse than showing
  // them nothing, so null has to survive all the way to the screen.
  it("returns null for an exam that does not report a score", () => {
    const blueprint = parseExamBlueprint({
      sections: [{ key: "safe_care", modules: [] }],
      composite: { kind: "none" },
    });
    expect(combineComposite(blueprint, [{ low: 10, high: 20 }])).toBeNull();
  });

  it("returns null when there are no section ranges to combine", () => {
    expect(combineComposite(parseExamBlueprint(SAT_CONFIG), [])).toBeNull();
  });

  it("defaults to no composite when no section carries a score", () => {
    const blueprint = parseExamBlueprint({
      sections: [{ key: "a", modules: [] }, { key: "b", modules: [] }],
    });
    expect(blueprint.composite).toEqual({ kind: "none" });
  });
});

// The ACT scores Science 1-36 and reports it, but stopped counting it
// towards the Composite in September 2025. Averaging it in anyway would
// print a number the student's own score report will not agree with.
describe("a section that is scored but not counted", () => {
  const ACT_LIKE = {
    sections: [
      { key: "english", modules: [], score: { min: 1, max: 36 } },
      { key: "math", modules: [], score: { min: 1, max: 36 } },
      { key: "reading", modules: [], score: { min: 1, max: 36 } },
      { key: "science", modules: [], score: { min: 1, max: 36 }, inComposite: false },
    ],
    composite: { kind: "average" },
  };

  it("reads inComposite off the section", () => {
    const blueprint = parseExamBlueprint(ACT_LIKE);
    expect(sectionByKey(blueprint, "english")?.inComposite).toBe(true);
    expect(sectionByKey(blueprint, "science")?.inComposite).toBe(false);
  });

  it("defaults to counting, since every other exam does", () => {
    const blueprint = parseExamBlueprint({
      sections: [{ key: "math", modules: [], score: { min: 200, max: 800 } }],
    });
    expect(sectionByKey(blueprint, "math")?.inComposite).toBe(true);
  });
});

describe("marking schemes", () => {
  const JEE = { correct: 4, incorrect: -1, unattempted: 0, maxMarks: 300 };

  it("is absent for the exams that report a scaled score", () => {
    expect(parseMarking(undefined)).toBeNull();
    expect(parseMarking(null)).toBeNull();
  });

  it("reads a full scheme", () => {
    expect(parseMarking(JEE)).toEqual(JEE);
  });

  it("refuses a partial scheme rather than assuming no penalty", () => {
    // Defaulting `incorrect` to 0 would turn a negative-marking exam into a
    // no-penalty one and teach the student to guess freely -- the exact
    // habit that loses marks on the day.
    expect(parseMarking({ correct: 4, maxMarks: 300 })).toBeNull();
    expect(parseMarking({ incorrect: -1, maxMarks: 300 })).toBeNull();
    expect(parseMarking({ correct: 4, incorrect: -1 })).toBeNull();
  });

  it("computes the marks the board itself would award", () => {
    // 60 right, 10 wrong, 5 blank on JEE Main: 240 - 10 = 230.
    const result = computeRawMarks({
      marking: JEE,
      correct: 60,
      incorrect: 10,
      unattempted: 5,
    });
    expect(result.marks).toBe(230);
    expect(result.maxMarks).toBe(300);
    expect(result.percent).toBe(77);
  });

  it("floors at zero rather than reporting a negative total", () => {
    const result = computeRawMarks({ marking: JEE, correct: 0, incorrect: 20, unattempted: 0 });
    expect(result.marks).toBe(0);
  });

  it("cannot exceed the maximum", () => {
    const result = computeRawMarks({ marking: JEE, correct: 100, incorrect: 0, unattempted: 0 });
    expect(result.marks).toBe(300);
  });

  it("prices a blind guess, against the folklore", () => {
    // "Never guess with negative marking" is wrong at +4/-1 on four
    // options: the expected value is +0.25, and eliminating one option
    // makes it clearly worth it.
    expect(guessExpectedValue(JEE, 4)).toBeCloseTo(0.25, 5);
    expect(guessExpectedValue(JEE, 3)).toBeCloseTo(0.6667, 3);
    expect(guessExpectedValue(JEE, 2)).toBeCloseTo(1.5, 5);

    // A harsher penalty flips it negative, and must say so.
    const harsh = { correct: 4, incorrect: -2, unattempted: 0, maxMarks: 300 };
    expect(guessExpectedValue(harsh, 4)).toBeLessThan(0);
  });
});
