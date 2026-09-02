// The exam tracks, as the student sees them.
//
// Every "Practice X questions" button on /exams goes to /home?track=X, and
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

export type ExamTrackId = "sat" | "ap" | "mcat" | "lsat" | "nclex";

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
    starters: ["AP World Unit 3", "AP Bio: cell signalling", "AP Gov: federalism"],
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
    blurb: "Clinical judgment vignettes with safety-first prioritisation.",
    placeholder: "Which NCLEX topic? Or paste your notes.",
    starters: ["Prioritisation", "Pharmacology safety", "Delegation"],
  },
};

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
