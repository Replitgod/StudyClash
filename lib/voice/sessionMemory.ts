// What Vyra remembers from the last time you spoke.
//
// Every call already ends by computing a summary -- which concepts were
// explained cleanly, which needed hints, and the specific wrong beliefs the
// student voiced -- and writing it to voice_sessions. Nothing ever read it
// back. The only query against that table counted minutes for the spend
// budget, so the tutor wrote down what happened and never looked at it
// again.
//
// The effect was a tutor with no memory. Every call opened cold, knowing
// only a list of topic names the app had flagged weak. A student who spent
// twenty minutes last Tuesday working through why the Calvin cycle does not
// need direct light got asked about it on Thursday as though they had never
// met.
//
// That gap is most of the difference between a tutor and a chatbot, and it
// is the one thing a general-purpose assistant cannot do: it has no record
// of what this student got wrong last week.
//
// This turns stored summaries into a short brief. Short is a requirement,
// not a preference -- it rides in the system prompt of a realtime voice
// session, where every token competes with the teaching instructions, and a
// long recitation of history would push out the part that says how to
// teach.

/** The slice of a voice_sessions row this needs. */
export type PastSessionRow = {
  ended_at: string | null;
  started_at: string | null;
  topics_covered: unknown;
  summary: unknown;
};

export type SessionMemory = {
  /** "yesterday", "3 days ago" -- said out loud, so it has to sound spoken. */
  when: string;
  topics: string[];
  strengths: string[];
  weaknesses: string[];
  /** "Concept: the specific wrong belief" -- the most valuable field here. */
  misconceptions: string[];
};

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    .slice(0, limit);
}

/**
 * How long ago, in words a person would actually say.
 *
 * Spoken aloud by a voice tutor, so "2026-09-08T14:03:00Z" and even
 * "2 days ago at 14:03" are both wrong. Rounded down deliberately: a call
 * 25 hours ago is "yesterday", not "1 day ago", because that is what the
 * student would call it.
 */
export function describeWhen(then: Date, now: Date): string {
  const ms = now.getTime() - then.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "recently";

  const minutes = Math.floor(ms / 60000);
  if (minutes < 90) return "earlier today";

  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return "earlier today";

  const days = Math.floor(ms / 86400000);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `about ${Math.round(days / 7)} weeks ago`;
  return "a while back";
}

/**
 * Read a stored session row into a memory, or null if there is nothing
 * worth remembering.
 *
 * A call where nothing was answered produces a summary with empty
 * strengths, weaknesses and misconceptions. Carrying that into the next call
 * would have the tutor open with "last time we covered nothing", which is
 * worse than opening fresh.
 */
export function readSessionMemory(row: PastSessionRow, now = new Date()): SessionMemory | null {
  const summary = (row.summary && typeof row.summary === "object" ? row.summary : {}) as Record<
    string,
    unknown
  >;

  const strengths = asStringArray(summary.strengths, 3);
  const weaknesses = asStringArray(summary.weaknesses, 3);
  const misconceptions = asStringArray(summary.misconceptions, 3);
  const topics = asStringArray(row.topics_covered, 4);

  if (strengths.length === 0 && weaknesses.length === 0 && misconceptions.length === 0) {
    return null;
  }

  const stamp = row.ended_at || row.started_at;
  const when = stamp ? describeWhen(new Date(stamp), now) : "recently";

  return { when, topics, strengths, weaknesses, misconceptions };
}

/**
 * The memory as a line for the system prompt.
 *
 * Written as instructions to the tutor rather than as a transcript, because
 * the model is being told what it knows, not shown a document. The closing
 * direction matters as much as the facts: without it a model handed "they
 * struggled with X" tends to open by re-teaching X from the top, which is
 * exactly what a student who half-learned it last time does not need.
 */
export function describeSessionMemory(memory: SessionMemory | null): string {
  if (!memory) return "";

  const parts: string[] = [];

  if (memory.topics.length > 0) {
    parts.push(`You last spoke ${memory.when}, about ${memory.topics.slice(0, 3).join(", ")}.`);
  } else {
    parts.push(`You last spoke ${memory.when}.`);
  }

  if (memory.strengths.length > 0) {
    parts.push(`They had ${memory.strengths.join(" and ")} down.`);
  }
  if (memory.weaknesses.length > 0) {
    parts.push(`They were shaky on ${memory.weaknesses.join(" and ")}.`);
  }
  if (memory.misconceptions.length > 0) {
    // The specific wrong belief, verbatim. A tutor who remembers the exact
    // error a student made is doing something no fresh chat can.
    parts.push(`Specific errors they made: ${memory.misconceptions.join("; ")}.`);
  }

  parts.push(
    "Do not re-teach any of this from scratch and do not recite this list back to them. Check whether it stuck, in one question, and move on if it has."
  );

  return parts.join(" ");
}
