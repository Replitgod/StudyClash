import { deriveState } from "./tutorState";
import type {
  ConceptProgress,
  SessionStats,
  SessionSummary,
  TutorSession,
} from "./types";

// The end-of-call review.
//
// Phase 20 of the brief bans the thing every study app ships -- "You did a
// great job, keep practicing!" -- and it is banned for a good reason: a
// summary that would read identically after a perfect session and a
// disastrous one carries no information, and students learn very quickly to
// scroll past it.
//
// So nothing here is generated. Every sentence is assembled from counters
// the session actually recorded: which concepts were answered cleanly,
// which needed hints, which specific wrong beliefs were named. If the
// session recorded nothing, this says so rather than inventing praise.

function label(session: TutorSession, conceptId: string): string {
  return session.concepts.find((c) => c.id === conceptId)?.label ?? conceptId;
}

export function computeStats(session: TutorSession, durationMs: number): SessionStats {
  const rows = Object.values(session.progress);

  return {
    questionCount: session.attempts.length,
    correctCount: session.attempts.filter((a) => a.verdict === "correct").length,
    partialCount: session.attempts.filter((a) => a.verdict === "partial").length,
    incorrectCount: session.attempts.filter((a) => a.verdict === "incorrect").length,
    unknownCount: session.attempts.filter((a) => a.verdict === "unknown").length,
    hintsUsed: rows.reduce((sum, row) => sum + row.hintsUsed, 0),
    conceptsMastered: rows.filter((row) => deriveState(row) === "mastered").length,
    conceptsPracticed: rows.filter((row) => row.asked > 0).length,
    durationMs: Math.max(0, durationMs),
  };
}

/** Strongest first: clean answers with no help beat correct-after-a-hint. */
function rankStrengths(session: TutorSession): ConceptProgress[] {
  return Object.values(session.progress)
    .filter((row) => {
      if (row.asked === 0 || row.correct === 0) return false;
      const state = deriveState(row);
      return state === "mastered" || state === "understood";
    })
    .sort((a, b) => {
      const unhintedA = a.correct - a.hintsUsed;
      const unhintedB = b.correct - b.hintsUsed;
      if (unhintedA !== unhintedB) return unhintedB - unhintedA;
      return b.strength - a.strength;
    });
}

/** Worst first, so the top of the list is where their time should go. */
function rankWeaknesses(session: TutorSession): ConceptProgress[] {
  return Object.values(session.progress)
    .filter((row) => {
      if (row.asked === 0) return false;
      const state = deriveState(row);
      return state === "shaky" || state === "learning";
    })
    .sort((a, b) => {
      if (a.strength !== b.strength) return a.strength - b.strength;
      const missesA = a.incorrect + a.unknown;
      const missesB = b.incorrect + b.unknown;
      return missesB - missesA;
    });
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function minutes(durationMs: number): number {
  return Math.max(1, Math.round(durationMs / 60000));
}

/**
 * Build the review.
 *
 * The headline is assembled rather than generated because it has to be true:
 * an LLM asked to summarize a transcript will happily report that a student
 * "showed strong understanding of photosynthesis" when the transcript shows
 * them being walked to it after three hints. The counters cannot do that.
 */
export function summarizeSession(
  session: TutorSession,
  durationMs: number
): SessionSummary {
  const stats = computeStats(session, durationMs);
  const strengthRows = rankStrengths(session);
  const weaknessRows = rankWeaknesses(session);

  const strengths = strengthRows.map((row) => label(session, row.conceptId));
  const weaknesses = weaknessRows.map((row) => label(session, row.conceptId));

  const misconceptions = Object.values(session.progress)
    .flatMap((row) =>
      row.misconceptions.map((text) => `${label(session, row.conceptId)}: ${text}`)
    )
    .slice(0, 6);

  // Nothing happened. Say that, rather than dressing up an empty session.
  if (stats.questionCount === 0) {
    return {
      stats,
      strengths: [],
      weaknesses: [],
      misconceptions: [],
      recommendation:
        "Start another call and answer a few questions out loud — nothing was recorded this time.",
      headline:
        durationMs < 20000
          ? "That call ended before it got going, so there is nothing to review yet."
          : "You were on the call, but no questions were answered, so there is nothing to review yet.",
      // Named even here. A student who spent five minutes changing subject
      // and answering nothing should still see what they wandered through.
      topics: session.topics,
    };
  }

  const clean = strengthRows.filter((row) => row.hintsUsed === 0);
  const sentences: string[] = [];

  // A call that changed subject is two lessons, and the review has to open
  // by saying so. Without this the concept names from both halves are
  // listed together as though they belonged to one topic, and a student who
  // moved from photosynthesis to algebra reads a paragraph that mixes them.
  if (session.topics.length > 1) {
    sentences.push(`You covered ${formatList(session.topics.slice(0, 4))} in this call.`);
  }

  if (clean.length > 0) {
    sentences.push(
      `You explained ${formatList(
        clean.slice(0, 3).map((row) => label(session, row.conceptId))
      )} without needing a hint.`
    );
  } else if (strengths.length > 0) {
    sentences.push(
      `You got to the right answer on ${formatList(strengths.slice(0, 3))}, though it took a hint or two.`
    );
  }

  const stubborn = weaknessRows.filter((row) => row.incorrect + row.unknown >= 2);
  if (stubborn.length > 0) {
    const worst = stubborn[0];
    const misses = worst.incorrect + worst.unknown;
    sentences.push(
      `${label(session, worst.conceptId)} came up short ${misses} times${
        stubborn.length > 1
          ? `, and ${formatList(
              stubborn.slice(1, 3).map((row) => label(session, row.conceptId))
            )} needed working through too`
          : ""
      }.`
    );
  } else if (weaknesses.length > 0) {
    sentences.push(`${formatList(weaknesses.slice(0, 2))} still needs another pass.`);
  }

  const firstMisconception = Object.values(session.progress)
    .flatMap((row) =>
      row.misconceptions.map((text) => ({ topic: label(session, row.conceptId), text }))
    )
    .at(0);

  if (firstMisconception) {
    sentences.push(
      `The specific thing to fix: on ${firstMisconception.topic}, ${firstMisconception.text}.`
    );
  }

  if (sentences.length === 0) {
    // Answers were recorded but nothing settled either way -- a short
    // session of partial answers. Report exactly that.
    sentences.push(
      `You worked through ${stats.questionCount} question${
        stats.questionCount === 1 ? "" : "s"
      } in ${minutes(durationMs)} minute${minutes(durationMs) === 1 ? "" : "s"}, with most answers landing halfway.`
    );
  }

  const recommendation = buildRecommendation(session, weaknessRows, stats);

  return {
    stats,
    strengths: strengths.slice(0, 6),
    weaknesses: weaknesses.slice(0, 6),
    misconceptions,
    recommendation,
    headline: sentences.join(" "),
    topics: session.topics,
  };
}

function buildRecommendation(
  session: TutorSession,
  weaknessRows: ConceptProgress[],
  stats: SessionStats
): string {
  if (weaknessRows.length > 0) {
    const worst = weaknessRows[0];
    const name = label(session, worst.conceptId);

    if (worst.misconceptions.length > 0) {
      return `Re-read ${name} with one question in mind: ${worst.misconceptions[0]}. Then run a weak-topic rematch on ${name} to check it stuck.`;
    }

    const others = weaknessRows.slice(1, 3).map((row) => label(session, row.conceptId));
    return others.length > 0
      ? `Practice ${name} next — it was the shakiest — then ${formatList(others)}.`
      : `Practice ${name} next. It was the only thing that did not settle.`;
  }

  const unseen = Object.values(session.progress).filter((row) => row.asked === 0).length;
  if (unseen > 0) {
    return `Nothing went badly. There ${unseen === 1 ? "is" : "are"} still ${unseen} ${
      unseen === 1 ? "concept" : "concepts"
    } in this material you have not been asked about — start another call to cover ${
      unseen === 1 ? "it" : "them"
    }.`;
  }

  if (stats.conceptsMastered > 0) {
    return `You covered everything here and ${stats.conceptsMastered} ${
      stats.conceptsMastered === 1 ? "concept is" : "concepts are"
    } solid. Take a practice test on this deck to see it under exam conditions.`;
  }

  return "You covered everything here. Come back to this deck in a couple of days so the spacing does its job.";
}
