import {
  moduleSize,
  sectionByKey,
  type ExamBlueprint,
} from "./examBlueprint";

// What a diagnostic will ACTUALLY give you, as opposed to what its blueprint
// asks for.
//
// The exam chooser described one exam: "the complete four-module structure
// with adaptive Module 2 routing and a scheduled break, ~2 hours 14 minutes."
// That is the Digital SAT, and it was shown to everybody. The ACT has four
// sections and no adaptive module, the MCAT has four and no break, and the
// NCLEX has one section and neither -- so three of the five exams described
// themselves as something they are not.
//
// The other half is supply. A blueprint says the ACT English section runs 50
// questions; the bank holds 20. The engine already serves what it has, which
// is the right behavior -- but a screen that promises 50 and delivers 20
// without a word is the thing that makes a product feel like a demo, and it
// is worse than saying "20" would have been.
//
// So this module answers both from data: what the exam is shaped like, and
// what is actually behind it today.

export type ModeAvailability = {
  mode: "quick" | "full";
  /** Questions that will actually be served, across every section. */
  questions: number;
  /** Questions the blueprint asks for. Equal to `questions` when supply is fine. */
  configured: number;
  /** Minutes allowed, scaled down when the bank cannot fill the time. */
  minutes: number;
  /** True when the bank cannot supply what the blueprint asks for. */
  short: boolean;
  /**
   * Whether to offer this mode at all.
   *
   * A "Full Diagnostic" that serves an eighth of its questions is not a full
   * diagnostic, and offering it teaches a student that the label means
   * nothing. Below the threshold the mode is withheld and the screen says
   * why, which is a better answer than a button that quietly under-delivers.
   */
  offered: boolean;
};

/**
 * How much of a mode's questions the bank must supply for it to be offered.
 *
 * Two thirds, which is loose enough that a bank still being filled in stays
 * usable and tight enough that nobody is sold two hours and given twenty
 * minutes. Quick mode is deliberately held to the same bar: a "quick
 * diagnostic" of four questions estimates nothing.
 */
const MIN_SUPPLY_RATIO = 2 / 3;

/** Below this, a mode is not worth offering however good the ratio looks. */
const MIN_QUESTIONS = 5;

/**
 * Published questions per section key.
 *
 * Read from the database by the caller, because diagnostic_questions is
 * RLS-closed to the browser -- it holds every answer key, and a count is the
 * only thing about it that is safe to expose.
 */
export type SectionSupply = Record<string, number>;

export function describeMode(
  blueprint: ExamBlueprint,
  supply: SectionSupply,
  mode: "quick" | "full"
): ModeAvailability {
  let configured = 0;
  let served = 0;
  let minutes = 0;

  for (const section of blueprint.sections) {
    const available = Math.max(0, supply[section.key] ?? 0);

    // Every module of the section in full mode; the one quick sample
    // otherwise. Full mode's modules draw from the same pool without
    // repeating, so the section can never serve more than it holds.
    const modules = mode === "full" ? section.modules : [section.modules[0]];

    let sectionConfigured = 0;
    let sectionMinutes = 0;
    // Named `part` rather than `module`, which Next forbids assigning to.
    for (const part of modules) {
      const size = moduleSize(blueprint, section.key, part.module, mode);
      sectionConfigured += size.questions;
      sectionMinutes += size.minutes;
      // Quick mode is one sample per section regardless of module count.
      if (mode === "quick") break;
    }

    const sectionServed = Math.min(sectionConfigured, available);

    configured += sectionConfigured;
    served += sectionServed;
    // Time is scaled to what is actually asked, so a section serving half its
    // questions does not sit the student in front of a timer for twice as
    // long as they need.
    minutes +=
      sectionConfigured > 0
        ? Math.round((sectionMinutes * sectionServed) / sectionConfigured)
        : 0;
  }

  const ratio = configured > 0 ? served / configured : 0;

  return {
    mode,
    questions: served,
    configured,
    minutes,
    short: served < configured,
    offered: served >= MIN_QUESTIONS && ratio >= MIN_SUPPLY_RATIO,
  };
}

export function describeModes(
  blueprint: ExamBlueprint,
  supply: SectionSupply
): ModeAvailability[] {
  return [describeMode(blueprint, supply, "quick"), describeMode(blueprint, supply, "full")];
}

/**
 * Does any section route into a second, adaptive module?
 *
 * The SAT and the GRE do; the ACT, MCAT and NCLEX do not. Saying "adaptive
 * Module 2 routing" on an exam without one is describing somebody else's
 * test.
 */
export function isAdaptive(blueprint: ExamBlueprint): boolean {
  return blueprint.sections.some((section) => section.modules.length > 1);
}

/** Is there a scheduled break? Only when there is more than one section. */
export function hasScheduledBreak(blueprint: ExamBlueprint): boolean {
  return blueprint.sections.length > 1 && blueprint.breakMinutesBetweenSections > 0;
}

/**
 * One sentence describing the shape of a full attempt, from the blueprint.
 *
 * Assembled rather than written down, because it was written down: every
 * exam claimed the SAT's four-module adaptive structure.
 */
export function describeStructure(blueprint: ExamBlueprint): string {
  const sections = blueprint.sections.length;
  const parts: string[] = [
    sections === 1 ? "One section" : `${sections} sections`,
  ];

  if (isAdaptive(blueprint)) {
    parts.push("with a second module chosen from how the first goes");
  }
  if (hasScheduledBreak(blueprint)) {
    parts.push(`and a ${blueprint.breakMinutesBetweenSections}-minute break`);
  }

  return `${parts.join(", ")}.`;
}

/** Section labels with what the bank actually holds, for the section list. */
export function describeSections(
  blueprint: ExamBlueprint,
  supply: SectionSupply
): Array<{ key: string; label: string; available: number; minutes: number }> {
  return blueprint.sections.map((section) => ({
    key: section.key,
    label: sectionByKey(blueprint, section.key)?.label ?? section.key,
    available: Math.max(0, supply[section.key] ?? 0),
    minutes: section.modules.reduce((sum, part) => sum + part.minutes, 0),
  }));
}
