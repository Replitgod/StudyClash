// One exam's shape, read from data rather than written into code.
//
// The diagnostic engine was built for the Digital SAT and it shows: the
// start route opened with a constant `FIRST_SECTION = "reading_writing"`,
// the quick-mode sizes were a two-key record keyed on the SAT's sections,
// and the score estimate added a Reading-and-Writing range to a Math range
// to produce a number between 400 and 1600. Every one of those is correct
// for the SAT and meaningless for the ACT, the MCAT or the NCLEX -- so the
// engine could hold exactly one exam, and every other card on /exams was a
// promise with nothing behind it.
//
// This module is where an exam's shape lives instead. It parses whatever is
// in exam_definitions.configuration into something the routes can ask
// questions of: which section comes first, how long a module runs, what a
// section score even means. Adding an exam becomes a migration.
//
// Pure and dependency-free on purpose. It is read by route handlers, by the
// scoring code and by client components, and it is the piece most worth
// having tests for -- a wrong section order is a diagnostic that asks the
// Math section twice.

export type ExamModuleBlueprint = {
  module: number;
  questions: number;
  minutes: number;
};

/**
 * How a section's score is reported.
 *
 * Absent means the section carries no score of its own -- which is the
 * honest answer for the NCLEX, where the real exam reports a pass/fail
 * decision and inventing a number for it would be worse than saying
 * nothing.
 */
export type ScoreScale = {
  min: number;
  max: number;
  /** Reported scores are rounded to this. 10 on the SAT, 1 nearly everywhere else. */
  step: number;
};

export type ExamSectionBlueprint = {
  key: string;
  label: string;
  modules: ExamModuleBlueprint[];
  /** AceDecks's own shorter sample. Derived from the modules when absent. */
  quick: { questions: number; minutes: number };
  score: ScoreScale | null;
  /**
   * Does this section's score feed the composite?
   *
   * False for the ACT's Science section, which is scored 1-36 and reported,
   * and which ACT stopped counting towards the Composite in September 2025.
   * Averaging it in anyway would print a number the student's score report
   * will not agree with.
   */
  inComposite: boolean;
};

/**
 * How section scores combine.
 *
 * - `sum`      SAT (400-1600), MCAT (472-528), GRE (260-340)
 * - `average`  ACT, whose composite is the mean of the four section scores
 * - `none`     NCLEX, and anything else that does not report a number.
 *              Readiness and accuracy are still reported; a score is not.
 */
export type CompositeRule =
  | { kind: "sum" }
  | { kind: "average" }
  | { kind: "none" };

export type ExamBlueprint = {
  sections: ExamSectionBlueprint[];
  breakMinutesBetweenSections: number;
  adaptive: { module2ThresholdAccuracy: number };
  composite: CompositeRule;
};

/** Used when a section says nothing about its own modules. */
const FALLBACK_MODULE: ExamModuleBlueprint = { module: 1, questions: 20, minutes: 25 };

const FALLBACK_THRESHOLD = 0.6;

function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A readable label for a section key, when the configuration omits one.
 *
 * "reading_writing" reads as "Reading writing" here rather than "Reading and
 * Writing", which is why every shipped exam sets `label` explicitly. This is
 * the floor, not the intent: it exists so a half-filled configuration row
 * renders something a human can read instead of a database key.
 */
export function humanizeSectionKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function parseScoreScale(raw: unknown): ScoreScale | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const min = Number(row.min);
  const max = Number(row.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;

  return { min, max, step: toPositiveInt(row.step, 1) };
}

function parseModules(raw: unknown): ExamModuleBlueprint[] {
  const list = Array.isArray(raw) ? raw : [];

  const modules = list
    .map((entry, index) => {
      const row = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      return {
        module: toPositiveInt(row.module, index + 1),
        questions: toPositiveInt(row.questions, FALLBACK_MODULE.questions),
        minutes: toPositiveInt(row.minutes, FALLBACK_MODULE.minutes),
      };
    })
    .sort((a, b) => a.module - b.module);

  return modules.length > 0 ? modules : [FALLBACK_MODULE];
}

/**
 * The short sample, derived from the real thing when not stated.
 *
 * Half the questions at the same per-question pace. Deriving rather than
 * defaulting to a round number means a new exam gets a sensibly sized quick
 * mode from its blueprint alone, which is the difference between adding an
 * exam in a migration and adding one in a migration plus two constants.
 */
function deriveQuick(modules: ExamModuleBlueprint[]): { questions: number; minutes: number } {
  const first = modules[0] ?? FALLBACK_MODULE;
  const questions = Math.max(5, Math.ceil(first.questions / 2));
  const pace = first.minutes / Math.max(1, first.questions);
  return { questions, minutes: Math.max(5, Math.round(questions * pace)) };
}

function parseSection(raw: unknown): ExamSectionBlueprint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const key = toText(row.key);
  // A section with no key cannot be assigned questions, resumed, or scored:
  // every one of those is a lookup by key. Dropping it is the only safe
  // reading, and it keeps a typo in one section from breaking the exam.
  if (!key) return null;

  const modules = parseModules(row.modules);
  const quickRaw = (row.quick && typeof row.quick === "object" ? row.quick : null) as Record<
    string,
    unknown
  > | null;
  const derived = deriveQuick(modules);

  return {
    key,
    label: toText(row.label) || humanizeSectionKey(key),
    modules,
    quick: {
      questions: toPositiveInt(quickRaw?.questions, derived.questions),
      minutes: toPositiveInt(quickRaw?.minutes, derived.minutes),
    },
    score: parseScoreScale(row.score),
    // Opt-out rather than opt-in: on every exam but the ACT, a section that
    // has a score contributes it.
    inComposite: row.inComposite !== false,
  };
}

function parseComposite(raw: unknown, sections: ExamSectionBlueprint[]): CompositeRule {
  const kind = toText(
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).kind : raw
  ).toLowerCase();

  if (kind === "sum" || kind === "average" || kind === "none") return { kind };

  // Nothing said. An exam whose sections carry no score cannot have a
  // composite; one whose sections do gets the commoner of the two rules.
  return sections.some((section) => section.score) ? { kind: "sum" } : { kind: "none" };
}

/**
 * Whatever is in exam_definitions.configuration, as something usable.
 *
 * Never throws and never returns an empty section list. A malformed or
 * empty configuration yields a single generic section, because the
 * alternative -- a route that 500s on a bad row -- turns one bad migration
 * into a broken exam page.
 */
export function parseExamBlueprint(raw: unknown): ExamBlueprint {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const sections = (Array.isArray(root.sections) ? root.sections : [])
    // Section order is the order they appear in the configuration: it is
    // the order the exam is sat in, and nothing else determines it.
    .map((entry) => parseSection(entry))
    .filter((section): section is ExamSectionBlueprint => section !== null);

  const resolved: ExamSectionBlueprint[] =
    sections.length > 0
      ? sections
      : [
          {
            key: "general",
            label: "Practice",
            modules: [FALLBACK_MODULE],
            quick: deriveQuick([FALLBACK_MODULE]),
            score: null,
            inComposite: true,
          },
        ];

  const adaptiveRaw = (root.adaptive && typeof root.adaptive === "object"
    ? root.adaptive
    : {}) as Record<string, unknown>;
  const threshold = Number(adaptiveRaw.module2ThresholdAccuracy);

  return {
    sections: resolved,
    breakMinutesBetweenSections: Math.max(0, toPositiveInt(root.breakMinutesBetweenSections, 10)),
    adaptive: {
      module2ThresholdAccuracy:
        Number.isFinite(threshold) && threshold > 0 && threshold < 1
          ? threshold
          : FALLBACK_THRESHOLD,
    },
    composite: parseComposite(root.composite, resolved),
  };
}

/* ------------------------------------------------------------------ lookups */

export function sectionKeys(blueprint: ExamBlueprint): string[] {
  return blueprint.sections.map((section) => section.key);
}

export function firstSectionKey(blueprint: ExamBlueprint): string {
  return blueprint.sections[0].key;
}

export function sectionByKey(
  blueprint: ExamBlueprint,
  key: string
): ExamSectionBlueprint | null {
  return blueprint.sections.find((section) => section.key === key) ?? null;
}

export function sectionLabel(blueprint: ExamBlueprint, key: string): string {
  return sectionByKey(blueprint, key)?.label ?? humanizeSectionKey(key);
}

/** The section after this one, or null when this was the last. */
export function nextSectionKey(blueprint: ExamBlueprint, current: string): string | null {
  const index = blueprint.sections.findIndex((section) => section.key === current);
  if (index < 0) return null;
  return blueprint.sections[index + 1]?.key ?? null;
}

/** How many modules a section runs. One means the section is not adaptive. */
export function moduleCount(blueprint: ExamBlueprint, section: string): number {
  return sectionByKey(blueprint, section)?.modules.length ?? 1;
}

export function moduleBlueprint(
  blueprint: ExamBlueprint,
  section: string,
  module: number
): ExamModuleBlueprint {
  const found = sectionByKey(blueprint, section)?.modules.find((m) => m.module === module);
  return found ?? FALLBACK_MODULE;
}

/**
 * How many questions to serve, and how long to allow.
 *
 * The single place the quick/full distinction is resolved. It used to be
 * two ternaries repeated in the start route and the submit-module route,
 * reading two different constants, which is exactly the shape that lets a
 * quick attempt hand out a full module's worth of questions on the second
 * section and nobody notice.
 */
export function moduleSize(
  blueprint: ExamBlueprint,
  section: string,
  module: number,
  mode: "quick" | "full"
): { questions: number; minutes: number } {
  if (mode === "quick") {
    const quick = sectionByKey(blueprint, section)?.quick;
    if (quick) return { questions: quick.questions, minutes: quick.minutes };
  }

  const found = moduleBlueprint(blueprint, section, module);
  return { questions: found.questions, minutes: found.minutes };
}

/* ------------------------------------------------------------------ scoring */

export type ScoreRange = { low: number; high: number };

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * An ability estimate, on this section's own scale.
 *
 * Generalised from the SAT-only version, and deliberately reproducing it
 * exactly for a 200-800/step-10 scale: center is the midpoint, one unit of
 * theta is a sixth of the range (so -3..+3 spans it), the adaptive path
 * moves the center by a fifth of a unit, and the reported band is 0.7 units
 * wide for a quick attempt and 0.4 for a full one.
 *
 * The band matters more than the center. A student who answered fourteen
 * questions has not earned a single number, and printing one anyway is the
 * most common way a practice product lies to somebody.
 */
export function estimateScoreRange(args: {
  theta: number;
  scale: ScoreScale;
  /** Which Module 2 they were routed to, when the section is adaptive. */
  path: "harder" | "easier" | null;
  mode: "quick" | "full";
}): ScoreRange {
  const { theta, scale, path, mode } = args;

  const center = (scale.min + scale.max) / 2;
  const unit = (scale.max - scale.min) / 6;

  const raw = center + theta * unit;
  // The harder Module 2 caps out with more headroom; the easier one caps
  // the estimate at what that module could actually confirm.
  const adjusted = path === "harder" ? raw + unit * 0.2 : path === "easier" ? raw - unit * 0.2 : raw;

  const centred = clamp(roundToStep(adjusted, scale.step), scale.min, scale.max);
  // Fewer items seen, wider band. Less data, less false precision.
  const halfWidth = unit * (mode === "quick" ? 0.7 : 0.4);

  return {
    low: clamp(roundToStep(centred - halfWidth, scale.step), scale.min, scale.max),
    high: clamp(roundToStep(centred + halfWidth, scale.step), scale.min, scale.max),
  };
}

/**
 * Section ranges into one reported range, or null when the exam does not
 * report a composite.
 *
 * Null is a real answer and callers must render it as "no score", not as
 * zero. The NCLEX reports a pass/fail decision and no scaled score at all;
 * showing a student "0-0" because the code needed a number would be worse
 * than showing them nothing.
 */
export function combineComposite(
  blueprint: ExamBlueprint,
  ranges: ScoreRange[]
): ScoreRange | null {
  if (blueprint.composite.kind === "none" || ranges.length === 0) return null;

  const low = ranges.reduce((sum, range) => sum + range.low, 0);
  const high = ranges.reduce((sum, range) => sum + range.high, 0);

  if (blueprint.composite.kind === "average") {
    return {
      low: Math.round(low / ranges.length),
      high: Math.round(high / ranges.length),
    };
  }

  return { low, high };
}
