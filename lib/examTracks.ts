// Exam-flavoured practice on a topic the student names.
//
// NOT the exam prep front door -- that is /exams, which starts a real timed
// attempt out of the validated bank in diagnostic_questions (see
// lib/examCatalog.ts). This is the other thing: the composer at /home,
// generating practice on whatever the student types, shaped like a given
// exam. It matters for a topic no bank covers, which on most exams is most
// topics.
//
// It used to be the ONLY thing /exams offered, which is why every card there
// was decorative. It is now one of two, and the smaller one.
//
// Historically: every "Practice X questions" button on /exams went to
// /home?track=X, and
// until now the track existed only as a hidden prop the composer put in an
// API request body. Nothing on the destination changed -- same greeting,
// same empty box, same placeholder -- so clicking "Practice SAT questions"
// looked exactly like being dumped back on the home screen. It was arriving
// correctly and saying nothing about it.
//
// This is the display half: what to call the track, what to ask for, and
// what to offer someone who does not know where to start. It lives in lib/
// rather than in either page so /exams and /home cannot drift -- the same
// mistake the FAQ and the homepage steps both made before they were moved
// to shared modules.

export type ExamTrackId =
  | "sat"
  | "act"
  | "ap"
  | "mcat"
  | "lsat"
  | "nclex"
  | "gre"
  | "gmat"
  | "jee"
  | "neet"
  | "usmle";

export type ExamTrackDisplay = {
  id: ExamTrackId;
  /** What the student calls it. */
  label: string;
  /** Sits under the greeting, so it must read as a place, not a setting. */
  blurb: string;
  /** Replaces the composer's generic "What are you studying?". */
  placeholder: string;
  /**
   * Offered when the box is empty. Real domains and topics from each exam,
   * so tapping one produces practice that looks like that exam rather than
   * a generic quiz.
   */
  starters: string[];
};

const TRACKS: Record<ExamTrackId, ExamTrackDisplay> = {
  sat: {
    id: "sat",
    label: "Digital SAT",
    blurb: "Questions in the digital SAT format, marked by the domains the real test reports.",
    placeholder: "Which SAT topic? Or paste a question you got wrong.",
    starters: ["Linear equations", "Command of Evidence", "Circles and trigonometry"],
  },
  ap: {
    id: "ap",
    label: "AP Exams",
    blurb: "AP-format questions, marked against AP scoring bands.",
    placeholder: "Which AP course and unit? Or paste your class notes.",
    starters: ["AP World Unit 3", "AP Bio: cell signaling", "AP Gov: federalism"],
  },
  mcat: {
    id: "mcat",
    label: "MCAT",
    blurb: "Passage-first science reasoning, in MCAT section taxonomy.",
    placeholder: "Which MCAT topic? Or paste a passage.",
    starters: ["Amino acids", "Enzyme kinetics", "CARS reasoning"],
  },
  lsat: {
    id: "lsat",
    label: "LSAT",
    blurb: "Argument structure and logical flaws, at LSAT difficulty.",
    placeholder: "Which LSAT question type? Or paste a stimulus.",
    starters: ["Flaw questions", "Necessary assumption", "Strengthen and weaken"],
  },
  nclex: {
    id: "nclex",
    label: "NCLEX",
    blurb: "Clinical judgment vignettes with safety-first prioritization.",
    placeholder: "Which NCLEX topic? Or paste your notes.",
    starters: ["Prioritization", "Pharmacology safety", "Delegation"],
  },
  act: {
    id: "act",
    label: "ACT",
    blurb: "Questions in the enhanced ACT format: English, Math, Reading, and Science.",
    placeholder: "Which ACT topic? Or paste a question you got wrong.",
    starters: ["Comma rules", "Functions", "Interpreting data tables"],
  },
  gre: {
    id: "gre",
    label: "GRE",
    blurb: "Text completion, reading, quantitative comparison, and problem solving.",
    placeholder: "Which GRE topic? Or paste a question you got wrong.",
    starters: ["Quantitative comparison", "Text completion", "Probability"],
  },
  gmat: {
    id: "gmat",
    label: "GMAT",
    blurb: "GMAT Focus style: problem solving, critical reasoning, and data sufficiency.",
    placeholder: "Which GMAT topic? Or paste a question you got wrong.",
    starters: ["Data sufficiency", "Critical reasoning: assumptions", "Rates and work"],
  },
  jee: {
    id: "jee",
    label: "JEE Main",
    blurb: "Physics, Chemistry and Maths at JEE Main depth, one correct option each.",
    placeholder: "Which JEE chapter? Or paste your notes.",
    starters: ["Rotational motion", "Chemical equilibrium", "Definite integrals"],
  },
  neet: {
    id: "neet",
    label: "NEET UG",
    blurb: "NCERT-bound Physics, Chemistry and Biology in NEET's question formats.",
    placeholder: "Which NEET chapter? Or paste your notes.",
    starters: ["Human physiology: circulation", "Genetics and inheritance", "Electrochemistry"],
  },
  usmle: {
    id: "usmle",
    label: "USMLE Step 1",
    blurb: "Clinical vignettes that test the basic science underneath.",
    placeholder: "Which Step 1 topic? Or paste your notes.",
    starters: ["Autonomic pharmacology", "Renal physiology", "Lysosomal storage diseases"],
  },
};

/**
 * Which topic-practice track an /exams page offers, by its URL slug.
 *
 * Every exam page can offer two things: the timed attempt out of the
 * validated bank (when one exists), and practice on a topic the student
 * names, written in that exam's style. The second is the only practice an
 * exam with no bank can offer, and before this mapping existed nothing in
 * the app linked to it at all.
 */
const CATALOG_TO_TRACK: Record<string, ExamTrackId> = {
  sat: "sat",
  act: "act",
  ap: "ap",
  mcat: "mcat",
  lsat: "lsat",
  nclex: "nclex",
  gre: "gre",
  gmat: "gmat",
  "jee-main": "jee",
  neet: "neet",
  "usmle-step-1": "usmle",
};

export function composerTrackForExam(catalogSlug: string): ExamTrackId | null {
  return CATALOG_TO_TRACK[catalogSlug] ?? null;
}

/** Unknown or missing ids resolve to null rather than throwing. */
export function resolveExamTrack(id: string | null | undefined): ExamTrackDisplay | null {
  if (!id) return null;
  return TRACKS[id.toLowerCase() as ExamTrackId] ?? null;
}

export const EXAM_TRACK_IDS = Object.keys(TRACKS) as ExamTrackId[];

/**
 * The server-side counterpart: validate a track id that arrived from a
 * client before it reaches the model's prompt.
 *
 * Deliberately derived from the SAME record the UI renders from. It used to
 * be a separate hand-written allowlist inside the generation route, and the
 * two drifted the moment SAT was added: the prompt builder had an SAT
 * branch, the allowlist did not, so /home?track=sat sanitised to null and
 * SAT practice quietly produced ordinary questions with nothing failing.
 *
 * Still a strict allowlist -- this value is interpolated into a prompt, so
 * an unvalidated one would let a caller write their own instructions.
 */
export function normalizeExamTrack(value: unknown): ExamTrackId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized in TRACKS ? (normalized as ExamTrackId) : null;
}
