import type {
  AttemptRecord,
  Concept,
  ConceptProgress,
  ConceptState,
  Difficulty,
  HintLevel,
  SessionOptions,
  StudentRequest,
  TutorSession,
  Verdict,
} from "./types";

// The tutoring loop, as data.
//
// The realtime model is very good at sounding like a tutor and unreliable at
// *being* one over a ten-minute call: ask it to remember that cellular
// respiration was missed twice and to come back to it later, and it will
// agree, then not do it. So the decisions that make this teaching rather
// than chatting -- what to ask next, when a hint escalates, when a concept
// counts as known -- live here, in a pure reducer the model cannot talk its
// way past. The model judges the answer (that genuinely needs a language
// model) and reports the verdict through a tool call; everything downstream
// of that verdict is arithmetic.
//
// Pure on purpose. No React, no network, no clock: `atMs` is passed in. That
// is what makes the hint ladder and the revisit logic testable without a
// microphone, which is the only way any of it was ever going to be verified.

/** Evidence added by one answer, before the hint discount. */
const STRENGTH_DELTA: Record<Verdict, number> = {
  correct: 2,
  partial: 1,
  incorrect: -1,
  unknown: -1,
};

/**
 * A correct answer that needed a hint is worth less than one that did not.
 * Without this a student can be walked to the answer four times and come out
 * the far side labelled "mastered", which makes the end-of-session review a
 * lie and, worse, stops the concept being revisited.
 */
const HINTED_CORRECT_STRENGTH = 1;

/** Strength floor, so one catastrophic run cannot bury a concept forever. */
const MIN_STRENGTH = -3;
const MAX_STRENGTH = 6;

/** Two clean answers is the least evidence that can honestly be called mastery. */
const MASTERY_MIN_CORRECT = 2;
const MASTERY_MIN_STRENGTH = 4;
const UNDERSTOOD_MIN_STRENGTH = 2;

/**
 * How many failed attempts in a row before we stop grinding and move on.
 *
 * The hint ladder runs nudge -> concept -> breakdown -> explain. After the
 * explain step the tutor re-asks once to check it landed; if that also
 * misses, staying on it stops being teaching and starts being a bad
 * afternoon. The concept is parked as `shaky` and comes back later from a
 * different angle, which is both kinder and better spacing.
 */
const STAY_LIMIT = 4;

/**
 * Turns that must pass before a concept can be asked again once it has been
 * put down. Immediate repetition tests short-term echo, not memory.
 */
const REVISIT_GAP: Record<ConceptState, number> = {
  unseen: 0,
  learning: 2,
  shaky: 3,
  understood: 5,
  mastered: 8,
};

/** Bucket priority for what to ask next. Lower sorts first. */
const STATE_PRIORITY: Record<ConceptState, number> = {
  shaky: 0,
  learning: 1,
  unseen: 2,
  understood: 3,
  mastered: 4,
};

export const DEFAULT_OPTIONS: SessionOptions = {
  style: "adaptive",
  difficulty: "adaptive",
  lengthMinutes: null,
};

function emptyProgress(conceptId: string): ConceptProgress {
  return {
    conceptId,
    state: "unseen",
    strength: 0,
    asked: 0,
    correct: 0,
    partial: 0,
    incorrect: 0,
    unknown: 0,
    hintsUsed: 0,
    consecutiveMisses: 0,
    lastAskedTurn: null,
    misconceptions: [],
  };
}

export function createSession(
  concepts: Concept[],
  options: SessionOptions = DEFAULT_OPTIONS
): TutorSession {
  const progress: Record<string, ConceptProgress> = {};
  for (const concept of concepts) {
    progress[concept.id] = emptyProgress(concept.id);
  }

  return {
    concepts,
    progress,
    attempts: [],
    activeConceptId: null,
    turn: 0,
    difficulty: options.difficulty,
    requests: [],
  };
}

/**
 * Derive the label from the evidence.
 *
 * Deliberately a pure function of the counters rather than a field that gets
 * assigned during transitions: a state machine with both ends up with rows
 * whose state and counters disagree, and then nobody can tell which one the
 * summary should believe.
 */
export function deriveState(progress: ConceptProgress): ConceptState {
  if (progress.asked === 0) return "unseen";
  if (progress.strength <= -1) return "shaky";
  if (progress.strength >= MASTERY_MIN_STRENGTH && progress.correct >= MASTERY_MIN_CORRECT) {
    return "mastered";
  }
  if (progress.strength >= UNDERSTOOD_MIN_STRENGTH) return "understood";
  return "learning";
}

/**
 * Where the tutor is on the hint ladder for a concept.
 *
 * Phase 5 of the brief in one function: never hand over the answer on the
 * first miss, escalate the specificity of help, and only explain outright
 * after repeated difficulty.
 */
export function hintLevelFor(progress: ConceptProgress | undefined): HintLevel {
  if (!progress) return "none";
  switch (progress.consecutiveMisses) {
    case 0:
      return "none";
    case 1:
      return "nudge";
    case 2:
      return "concept";
    case 3:
      return "breakdown";
    default:
      return "explain";
  }
}

/**
 * Mark that a question has been asked on a concept.
 *
 * Separate from recording the answer because the two genuinely happen at
 * different moments, and the gap between them is where "the student is
 * thinking" lives. Asking is also what advances the turn counter, so spacing
 * is measured in questions rather than in wall-clock time -- a student who
 * takes a phone call mid-session should not come back to everything having
 * aged past its revisit gap.
 */
export function recordAsked(session: TutorSession, conceptId: string): TutorSession {
  const existing = session.progress[conceptId];
  if (!existing) return session;

  const turn = session.turn + 1;

  return {
    ...session,
    turn,
    activeConceptId: conceptId,
    progress: {
      ...session.progress,
      [conceptId]: { ...existing, asked: existing.asked + 1, lastAskedTurn: turn },
    },
  };
}

export function recordAttempt(
  session: TutorSession,
  input: {
    conceptId: string;
    verdict: Verdict;
    misconception?: string | null;
    /** True when the tutor had already given help on this attempt. */
    usedHint?: boolean;
    atMs: number;
  }
): TutorSession {
  const existing = session.progress[input.conceptId];
  if (!existing) return session;

  const hintLevel = hintLevelFor(existing);
  const usedHint = input.usedHint ?? hintLevel !== "none";

  // A correct answer that needed help is still progress, just less of it.
  const delta =
    input.verdict === "correct" && usedHint
      ? HINTED_CORRECT_STRENGTH
      : STRENGTH_DELTA[input.verdict];

  const isMiss = input.verdict === "incorrect" || input.verdict === "unknown";

  const misconception = (input.misconception || "").trim();

  const next: ConceptProgress = {
    ...existing,
    strength: Math.max(MIN_STRENGTH, Math.min(MAX_STRENGTH, existing.strength + delta)),
    correct: existing.correct + (input.verdict === "correct" ? 1 : 0),
    partial: existing.partial + (input.verdict === "partial" ? 1 : 0),
    incorrect: existing.incorrect + (input.verdict === "incorrect" ? 1 : 0),
    unknown: existing.unknown + (input.verdict === "unknown" ? 1 : 0),
    hintsUsed: existing.hintsUsed + (usedHint ? 1 : 0),
    // A partial answer neither escalates the ladder nor clears it: they are
    // mid-thought, and jumping to a stronger hint would step on the half
    // they already have.
    consecutiveMisses: isMiss
      ? existing.consecutiveMisses + 1
      : input.verdict === "correct"
        ? 0
        : existing.consecutiveMisses,
    misconceptions:
      misconception && !existing.misconceptions.includes(misconception)
        ? [...existing.misconceptions, misconception]
        : existing.misconceptions,
  };

  next.state = deriveState(next);

  const attempt: AttemptRecord = {
    conceptId: input.conceptId,
    verdict: input.verdict,
    hintLevel,
    misconception: misconception || null,
    turn: session.turn,
    atMs: input.atMs,
  };

  return {
    ...session,
    attempts: [...session.attempts, attempt],
    progress: { ...session.progress, [input.conceptId]: next },
  };
}

export function recordRequest(
  session: TutorSession,
  request: StudentRequest
): TutorSession {
  let difficulty: Difficulty = session.difficulty;
  if (request === "harder") difficulty = "hard";
  if (request === "easier") difficulty = "easy";

  return { ...session, difficulty, requests: [...session.requests, request] };
}

/**
 * Whether the tutor should stay on the concept it is already working.
 *
 * An idea is "settled" only when they got it right. Anything else -- a miss,
 * an "I don't know", or a half-answer -- means the tutor's next turn belongs
 * to the same concept.
 *
 * The half-answer case is the one worth spelling out, because getting it
 * wrong is the exact failure the brief uses to define the feature: asked the
 * purpose of mitosis, a student says "to create cells". That is the right
 * area and not the right answer, and a tutor that banks it and moves on has
 * taught nothing. What it owes them is "right idea -- what KIND of cells,
 * compared with the original?", which means staying put.
 *
 * Note this is a different question from how much help to give, which is why
 * it does not reuse consecutiveMisses: a partial answer keeps you on the
 * concept without escalating the hint ladder, because they already have half
 * of it and a stronger hint would step on the half they got.
 */
export function shouldStayOnActive(session: TutorSession): boolean {
  const activeId = session.activeConceptId;
  if (!activeId || !session.progress[activeId]) return false;

  // The trailing run of unsettled answers on this concept. Counting from the
  // end of the attempt log rather than from a stored counter means a concept
  // revisited later starts its run fresh, which is what "come back to it
  // from a different angle" is supposed to mean.
  let run = 0;
  for (let i = session.attempts.length - 1; i >= 0; i -= 1) {
    const attempt = session.attempts[i];
    if (attempt.conceptId !== activeId) continue;
    if (attempt.verdict === "correct") break;
    run += 1;
  }

  return run > 0 && run <= STAY_LIMIT;
}

/**
 * Decide what to ask next.
 *
 * Priority runs shaky -> learning -> unseen -> understood -> mastered, which
 * is the brief's ordering, with two adjustments that matter in practice:
 * a concept the app already knew was weak jumps the queue within its bucket,
 * and nothing is asked again until its revisit gap has passed, so the tutor
 * cannot get stuck alternating between two cards.
 *
 * Returns null only when every concept is on cooldown, which is the caller's
 * signal to relax spacing rather than end the call.
 */
export function selectNextConcept(
  session: TutorSession,
  options: { style?: SessionOptions["style"]; ignoreSpacing?: boolean } = {}
): Concept | null {
  if (session.concepts.length === 0) return null;

  if (shouldStayOnActive(session)) {
    const active = session.concepts.find((c) => c.id === session.activeConceptId);
    if (active) return active;
  }

  const style = options.style ?? "adaptive";

  const candidates = session.concepts
    .map((concept, index) => {
      const progress = session.progress[concept.id] ?? emptyProgress(concept.id);
      const state = deriveState(progress);
      const sinceAsked =
        progress.lastAskedTurn === null ? Infinity : session.turn - progress.lastAskedTurn;
      const gap = REVISIT_GAP[state];

      return { concept, progress, state, index, sinceAsked, ready: sinceAsked >= gap };
    })
    // Never offer the concept we just asked; even with spacing relaxed,
    // repeating the question the student is mid-way through answering is
    // never the right move.
    .filter((entry) => entry.concept.id !== session.activeConceptId)
    .filter((entry) => (options.ignoreSpacing ? true : entry.ready));

  if (candidates.length === 0) {
    // Everything is on cooldown. Relax spacing once rather than stalling.
    return options.ignoreSpacing
      ? null
      : selectNextConcept(session, { ...options, ignoreSpacing: true });
  }

  const bucketOf = (state: ConceptState): number => {
    // "Review everything" walks the material in order and only re-queues
    // what was actually missed, so a student who asked to go through the
    // whole deck is not left with half of it untouched.
    if (style === "review_all") return state === "unseen" ? 0 : STATE_PRIORITY[state] + 1;
    // "Test me" wants coverage and pace over remediation.
    if (style === "test_me") return state === "unseen" ? 0 : STATE_PRIORITY[state];
    return STATE_PRIORITY[state];
  };

  candidates.sort((a, b) => {
    const bucketDiff = bucketOf(a.state) - bucketOf(b.state);
    if (bucketDiff !== 0) return bucketDiff;

    // Known-weak material first, because that is the whole reason the
    // student opened a tutor rather than a flashcard app.
    const weakDiff = Number(b.concept.priorWeak) - Number(a.concept.priorWeak);
    if (weakDiff !== 0) return weakDiff;

    // Then whatever has waited longest.
    if (a.sinceAsked !== b.sinceAsked) return b.sinceAsked - a.sinceAsked;

    // Deck order, so a session is reproducible and testable.
    return a.index - b.index;
  });

  return candidates[0].concept;
}

/**
 * The live mastery meter (Phase 42), as percentages.
 *
 * Explicitly an estimate: it is a linear read of the same strength score the
 * ladder uses, not a psychometric model, and the UI labels it as such. What
 * it must never do is claim knowledge the session did not demonstrate, which
 * is why an unseen concept reads 0 rather than a flattering default.
 */
export function masteryEstimates(
  session: TutorSession
): Array<{ conceptId: string; label: string; percent: number; state: ConceptState }> {
  return session.concepts.map((concept) => {
    const progress = session.progress[concept.id] ?? emptyProgress(concept.id);
    const state = deriveState(progress);
    const span = MAX_STRENGTH - MIN_STRENGTH;
    const percent =
      progress.asked === 0
        ? 0
        : Math.max(
            0,
            Math.min(100, Math.round(((progress.strength - MIN_STRENGTH) / span) * 100))
          );

    return { conceptId: concept.id, label: concept.label, percent, state };
  });
}

/** Concepts still worth the student's time, worst first. Drives "practice these". */
export function weakConcepts(session: TutorSession, limit = 5): Concept[] {
  return session.concepts
    .filter((concept) => {
      const progress = session.progress[concept.id];
      if (!progress || progress.asked === 0) return false;
      const state = deriveState(progress);
      return state === "shaky" || state === "learning";
    })
    .sort((a, b) => {
      const pa = session.progress[a.id];
      const pb = session.progress[b.id];
      return pa.strength - pb.strength;
    })
    .slice(0, limit);
}
