// What /exams is allowed to say about each exam.
//
// There were two exam-prep front doors and only one of them was real.
// /diagnostics read exam_definitions and started an actual timed attempt out
// of an actual question bank. /exams was a set of hand-written cards whose
// only button went to /home?track=sat, where the student typed a topic and
// got generic AI-generated questions -- the exact "decorative exam-prep card
// with no actual content" this product must not ship.
//
// This module is the join between them. /exams keeps its URLs, because they
// are in the sitemap and are the pages search sends people to, and every
// route on it now points at the real thing.
//
// Pure data and pure functions: the pages that render it are server
// components, and everything here has to be readable from a test.

export type ExamTrackSlug = "sat" | "act" | "ap" | "mcat" | "lsat" | "nclex" | "gre";

export type ExamTrackEntry = {
  /** The URL segment. Never changes -- these are indexed. */
  slug: ExamTrackSlug;
  /**
   * The exam_definitions row this track practices from, or null when the
   * track has no bank yet.
   *
   * Null is the honest answer for a track we have not built, and it is what
   * stops the page offering a button that leads nowhere.
   */
  examSlug: string | null;
  name: string;
  /** One line, said plainly. Shown on the card and as the page subtitle. */
  promise: string;
  /** The board's own free material. Linked, never copied. */
  officialLabel: string;
  officialUrl: string;
  /**
   * True when the questions have not been checked by anyone with
   * credentials in the field.
   *
   * Kept per-track rather than assumed, because it is the difference between
   * an AP question being wrong and a nursing question being wrong.
   */
  needsExpertReview: boolean;
};

const CATALOG: ExamTrackEntry[] = [
  {
    slug: "sat",
    examSlug: "digital-sat",
    name: "Digital SAT",
    promise:
      "Two-module practice in the digital format: short-passage Reading and Writing, and Math with a real share of grid-ins.",
    officialLabel: "Official full-length practice tests, from College Board",
    officialUrl: "https://satsuite.collegeboard.org/practice",
    needsExpertReview: false,
  },
  {
    slug: "act",
    examSlug: "act",
    name: "ACT",
    promise:
      "The enhanced ACT: English, Math and Reading, with Science kept separate the way the Composite now treats it.",
    officialLabel: "Free official practice, from ACT",
    officialUrl: "https://www.act.org/content/act/en/products-and-services/the-act/test-preparation.html",
    needsExpertReview: false,
  },
  {
    slug: "nclex",
    examSlug: "nclex-rn",
    name: "NCLEX-RN",
    promise:
      "Clinical judgment practice across all eight content areas of the current NCSBN test plan, with rationales that name the principle.",
    officialLabel: "Official NCLEX preparation resources",
    officialUrl: "https://www.nclex.com/prepare.page",
    needsExpertReview: true,
  },
  {
    slug: "mcat",
    examSlug: "mcat",
    name: "MCAT",
    promise: "Passage-first scientific reasoning across all four sections.",
    officialLabel: "AAMC free practice exam",
    officialUrl:
      "https://students-residents.aamc.org/prepare-mcat-exam/practice-mcat-exam-official-low-cost-products",
    needsExpertReview: true,
  },
  {
    slug: "gre",
    examSlug: "gre",
    name: "GRE",
    promise:
      "The shortened General Test: two Verbal measures and two Quantitative, with the second of each pitched to how the first went.",
    officialLabel: "Free POWERPREP practice, from ETS",
    officialUrl: "https://www.ets.org/gre/test-takers/general-test/prepare.html",
    needsExpertReview: false,
  },
  {
    slug: "ap",
    // No AP bank yet. Named here anyway rather than deleted, because the
    // page exists, is indexed, and should say what is true rather than
    // vanish -- and because leaving it out is how a track quietly loses its
    // link from the catalog and nobody notices for a month.
    examSlug: null,
    name: "AP Exams",
    promise: "AP-format questions at classroom pacing and depth.",
    officialLabel: "Past free-response questions, from College Board",
    officialUrl: "https://apcentral.collegeboard.org/courses/past-exam-questions",
    needsExpertReview: false,
  },
  {
    slug: "lsat",
    examSlug: null,
    name: "LSAT",
    promise: "Argument structure, logical flaws, and timed pressure drills.",
    officialLabel: "LSAC free PrepTests (LawHub)",
    officialUrl: "https://www.lsac.org/lsat/prepare/official-lsat-practice-tests",
    needsExpertReview: true,
  },
];

export const EXAM_TRACKS: readonly ExamTrackEntry[] = CATALOG;

/**
 * The tracks that have a question bank behind them, for copy that names them.
 *
 * Derived rather than written down, because it was written down: /practice
 * advertised "AP, SAT, MCAT, LSAT, NCLEX" long after two of those had
 * nothing behind them and two exams that did were missing from the list.
 * A sentence listing products has to be generated from the products.
 */
export function tracksWithBanks(): ExamTrackEntry[] {
  return CATALOG.filter((entry) => entry.examSlug !== null);
}

export function findExamTrack(slug: string | null | undefined): ExamTrackEntry | null {
  if (!slug) return null;
  const normalized = slug.trim().toLowerCase();
  return CATALOG.find((entry) => entry.slug === normalized) ?? null;
}

/** The catalog entry for an exam_definitions slug, if a track practices it. */
export function findTrackByExamSlug(examSlug: string): ExamTrackEntry | null {
  return CATALOG.find((entry) => entry.examSlug === examSlug) ?? null;
}

/**
 * Is this track something a student can practice right now?
 *
 * Both halves matter and they fail independently. An exam can be `available`
 * in the database with an empty bank -- that is what every "coming soon" row
 * was -- and a bank can exist behind an exam nobody has switched on. A card
 * that offers practice must have both.
 */
export function isTrackPlayable(args: {
  track: ExamTrackEntry;
  examStatus?: string | null;
  publishedQuestions?: number | null;
  /**
   * Whether any mode behind this exam can actually run, from
   * lib/examModes.ts. Omitted, the older rule applies -- a non-empty bank is
   * enough -- which keeps every existing caller and test working.
   *
   * Supplied, it wins. /exams and /diagnostics/[examSlug] used to decide
   * this separately and disagreed the moment a bank went thin: the card
   * offered "Practice MCAT" and the page behind it said there were not
   * enough questions to estimate anything.
   */
  offeredModes?: number | null;
}): boolean {
  const { track, examStatus, publishedQuestions, offeredModes } = args;
  if (!track.examSlug) return false;
  if (examStatus !== "available") return false;
  if ((publishedQuestions ?? 0) <= 0) return false;
  if (offeredModes === undefined || offeredModes === null) return true;
  return offeredModes > 0;
}

/**
 * What the card's button should say and do.
 *
 * Returns null when there is nothing honest to offer, and the caller renders
 * the "not yet" state rather than a button. The whole point of this function
 * is that "not yet" is a real outcome with its own rendering, instead of a
 * button that quietly goes somewhere unrelated.
 */
export function trackAction(args: {
  track: ExamTrackEntry;
  examStatus?: string | null;
  publishedQuestions?: number | null;
  offeredModes?: number | null;
}): { label: string; href: string } | null {
  if (!isTrackPlayable(args)) return null;
  return {
    label: `Practice ${args.track.name}`,
    href: `/diagnostics/${args.track.examSlug}`,
  };
}
