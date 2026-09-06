// Shared vocabulary for the voice tutor.
//
// Everything here is plain data with no imports, because the same types are
// read by a "use client" component, by a Node route handler, and by vitest
// under the node environment. Anything that reaches for `window` or for
// Supabase belongs in one of the modules that imports this, never here.

/**
 * How well the student knows one concept, right now, in this call.
 *
 * This is a *session* judgement, not the app's long-term mastery number.
 * lib/mastery.ts owns the latter and is computed from graded questions;
 * spoken answers are softer evidence than a marked multiple-choice attempt,
 * so they feed it as a nudge (see summarizeSession) rather than overwriting
 * it.
 */
export type ConceptState = "unseen" | "learning" | "shaky" | "understood" | "mastered";

/**
 * The verdict on one spoken answer.
 *
 * `unknown` is deliberately its own value rather than a flavour of
 * `incorrect`: "I don't know" is a different teaching situation from a
 * confident wrong answer. One needs a hint, the other needs the
 * misconception named before anything else can land.
 */
export type Verdict = "correct" | "partial" | "incorrect" | "unknown";

/** Where the tutor is on the hint ladder for the concept in play. */
export type HintLevel = "none" | "nudge" | "concept" | "breakdown" | "explain";

/** Something the student asked for out loud, that changes how we continue. */
export type StudentRequest = "harder" | "easier" | "repeat" | "explain" | "skip";

/**
 * One examinable idea, distilled from the student's own material.
 *
 * `id` is short and opaque because it travels to the model and back through
 * tool calls; a long id wastes tokens on every turn and a human-readable one
 * invites the model to invent plausible-looking ids that match nothing.
 */
export type Concept = {
  id: string;
  label: string;
  /** Source lines that ground this concept. Never invented. */
  facts: string[];
  /** True when the app already knew this was a weak spot before the call. */
  priorWeak: boolean;
  /**
   * Which subject of the call this belongs to. 0 is what the call opened on;
   * each mid-call topic switch adds one.
   *
   * Concepts are APPENDED on a switch rather than replaced, because the
   * session's attempts point at concept ids and the end-of-call review
   * resolves those ids back to labels through this list. Replacing it would
   * make everything taught before the switch resolve to a raw id like "c3"
   * — the student would finish a two-subject call and be reviewed on one.
   *
   * Absent means 0, so every session created before switching existed reads
   * correctly without a migration.
   */
  segment?: number;
};

export type ConceptProgress = {
  conceptId: string;
  state: ConceptState;
  /**
   * Running evidence score. Positive is knowledge, negative is trouble.
   * Kept separate from `state` so the thresholds live in one place and the
   * state is always derivable rather than separately assigned.
   */
  strength: number;
  asked: number;
  correct: number;
  partial: number;
  incorrect: number;
  unknown: number;
  hintsUsed: number;
  /** Resets to 0 on any correct answer. Drives the hint ladder. */
  consecutiveMisses: number;
  /** Turn index of the last question on this concept, for spacing. */
  lastAskedTurn: number | null;
  misconceptions: string[];
};

export type AttemptRecord = {
  conceptId: string;
  verdict: Verdict;
  /** Hint level the student was on when they answered. */
  hintLevel: HintLevel;
  misconception: string | null;
  turn: number;
  atMs: number;
};

export type TutorSession = {
  concepts: Concept[];
  progress: Record<string, ConceptProgress>;
  attempts: AttemptRecord[];
  /** The concept the tutor is currently working on, if any. */
  activeConceptId: string | null;
  /** Monotonic counter; one per question asked. Used for spacing, not time. */
  turn: number;
  /** Difficulty the student has steered us to. */
  difficulty: Difficulty;
  requests: StudentRequest[];
  /**
   * The subject currently being taught. Only concepts with this segment are
   * offered as the next question, so a switch to algebra does not wander
   * back into photosynthesis three turns later.
   */
  segment: number;
  /**
   * Every topic taught in this call, in order, starting with the one it
   * opened on. Drives the end-of-call review and voice_sessions.topics_covered.
   */
  topics: string[];
};

export type Difficulty = "easy" | "normal" | "hard" | "adaptive";

export type StudyStyle = "adaptive" | "review_all" | "weak_first" | "test_me";

/**
 * How the call is taught, as distinct from what it is taught from.
 *
 * The tutor used to have exactly one shape: ask, judge, hint, ask again.
 * That is the right shape for material a student has already studied, and
 * the wrong shape the moment they can call about any topic at all -- because
 * "teach me the Krebs cycle" is said by someone who does not know the Krebs
 * cycle, and quizzing them on it produces four "I don't know"s in a row and
 * a student who hangs up.
 *
 * - `quiz`  active recall on material they have seen. The original loop.
 * - `learn` teach a piece, check they got it, teach the next piece. The
 *           default for a topic call, where there is nothing to recall yet.
 * - `exam`  exam-format questions and exam-format reasoning, out loud.
 */
export type TutoringMode = "quiz" | "learn" | "exam";

/**
 * How advanced the explanation should be.
 *
 * Deliberately separate from `Difficulty`. Difficulty is how hard the
 * QUESTIONS are; level is who is being spoken to. A hard question for a
 * ten-year-old and an easy question for a medical student are different in
 * vocabulary, in how much is assumed, and in what counts as a full answer --
 * and collapsing the two produced a tutor that made questions harder by
 * making them wordier.
 */
export type EducationLevel =
  | "unspecified"
  | "elementary"
  | "middle"
  | "high_school"
  | "ap_honors"
  | "undergraduate"
  | "graduate"
  | "professional";

export type SessionOptions = {
  style: StudyStyle;
  difficulty: Difficulty;
  /** Minutes, or null for "until I stop". */
  lengthMinutes: number | null;
  mode: TutoringMode;
  level: EducationLevel;
};

/**
 * What the student launched the tutor from.
 *
 * `topic` is the one that does not read from the database at all: the
 * student named a subject and the concepts were generated for it. Everything
 * else is grounded in material they already own.
 */
export type SourceType = "deck" | "note" | "weak_topics" | "open" | "topic";

export type TranscriptTurn = {
  id: string;
  role: "student" | "tutor";
  text: string;
  atMs: number;
};

export type SessionStats = {
  questionCount: number;
  correctCount: number;
  partialCount: number;
  incorrectCount: number;
  unknownCount: number;
  hintsUsed: number;
  conceptsMastered: number;
  conceptsPracticed: number;
  durationMs: number;
};

export type SessionSummary = {
  stats: SessionStats;
  /** Concepts they demonstrably know, most convincing first. */
  strengths: string[];
  /** Concepts that need another pass, worst first. */
  weaknesses: string[];
  /** Specific wrong ideas worth re-reading, in the student's own terms. */
  misconceptions: string[];
  /** One concrete thing to do next. Never "keep practising". */
  recommendation: string;
  /** A written review built only from what actually happened. */
  headline: string;
};
