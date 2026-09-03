import {
  hintLevelFor,
  masteryEstimates,
  recordAsked,
  recordAttempt,
  recordRequest,
  selectNextConcept,
} from "./tutorState";
import type {
  Concept,
  HintLevel,
  StudentRequest,
  TutorSession,
  Verdict,
} from "./types";

// The contract between the realtime model and the app's tutoring state.
//
// Three tools, and the important design decision is that two of them RETURN
// the next move rather than merely acknowledging. The model does the one job
// only a language model can do -- deciding whether a spoken, rambling,
// half-remembered answer contains the right idea -- and hands that verdict
// over. What comes back is not "ok": it is the exact concept to ask next,
// the source lines that ground it, and which rung of the hint ladder to use.
//
// That inversion is what stops the tutor drifting. A prompt asking the model
// to "come back to weak topics later" is a suggestion it will forget by
// minute four; a tool response saying "ask about osmosis next, they have
// missed it twice, give a conceptual hint" is not something it can forget,
// because it arrives immediately before it speaks.

export const TOOL_RECORD_ANSWER = "record_answer";
export const TOOL_NEXT_QUESTION = "next_question";
export const TOOL_NOTE_REQUEST = "note_request";

/**
 * Tool schemas for the realtime session.
 *
 * Kept deliberately small. Every property here is described to the model on
 * every turn, and a realtime session pays for that context in latency as
 * well as tokens.
 */
export const VOICE_TUTOR_TOOLS = [
  {
    type: "function" as const,
    name: TOOL_RECORD_ANSWER,
    description:
      "Call this immediately after the student answers a question you asked, before you say anything back. Judge whether their spoken answer contained the right IDEA, not whether it matched the wording. Returns the next thing to ask and how much help to give.",
    parameters: {
      type: "object",
      properties: {
        concept_id: {
          type: "string",
          description: "The id of the concept you asked about. Use the id you were given.",
        },
        verdict: {
          type: "string",
          enum: ["correct", "partial", "incorrect", "unknown"],
          description:
            "correct = the idea is there even if loosely worded. partial = some of it is there. incorrect = the idea is genuinely not there. unknown = they said they do not know, or said nothing useful.",
        },
        misconception: {
          type: "string",
          description:
            "Only when they believe something specific and wrong. One short phrase naming the wrong belief, e.g. 'thinks osmosis moves solute rather than water'. Omit otherwise.",
        },
      },
      required: ["concept_id", "verdict"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: TOOL_NEXT_QUESTION,
    description:
      "Call this when you need something to ask: at the very start of the call, and any time you have finished a thread and want the next topic. Returns the concept to ask about and the source material for it.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: TOOL_NOTE_REQUEST,
    description:
      "Call this when the student asks you to change how the session runs — harder, easier, repeat that, explain it, or skip this one.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["harder", "easier", "repeat", "explain", "skip"],
        },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
];

/** What the app sends back down the tool channel. Read aloud by nobody — it steers. */
export type NextMove = {
  concept_id: string;
  topic: string;
  /** Source lines. The model must ask from these and not invent around them. */
  material: string[];
  hint_level: HintLevel;
  /** Plain-English instruction for this specific turn. */
  guidance: string;
  /** Rolling count so the tutor can reference real progress out loud. */
  answered: number;
  correct: number;
};

export type ToolResult = {
  session: TutorSession;
  /** JSON-serialisable payload for the function_call_output item. */
  output: Record<string, unknown>;
  /** Set when this call changed the concept in play, for the UI. */
  activeConcept: Concept | null;
};

const HINT_GUIDANCE: Record<HintLevel, string> = {
  none: "Ask this as a fresh question, in your own words. One question only.",
  nudge:
    "They missed this once. Do NOT give the answer. Tease them warmly, then give one small hint that narrows it down, and ask again.",
  concept:
    "They have missed this twice. Still no answer. Give a more specific conceptual hint — point at the underlying idea — then ask again.",
  breakdown:
    "Three misses. Break the problem into steps and ask them only the first step. Small, answerable.",
  explain:
    "They are stuck. Explain the idea clearly and quickly — one breath, no lecture — then immediately ask a NEW short question on the same idea in different words so they still have to retrieve it.",
};

function describeMove(
  session: TutorSession,
  concept: Concept,
  hintLevel: HintLevel
): NextMove {
  const answered = session.attempts.length;
  const correct = session.attempts.filter((a) => a.verdict === "correct").length;

  const progress = session.progress[concept.id];
  const priorNote =
    progress && progress.asked > 0 && progress.consecutiveMisses === 0
      ? " You have asked about this before in this call — come at it from a different angle this time."
      : concept.priorWeak && (!progress || progress.asked === 0)
        ? " They have got this wrong in past study sessions, so expect it to be shaky."
        : "";

  return {
    concept_id: concept.id,
    topic: concept.label,
    material: concept.facts,
    hint_level: hintLevel,
    guidance: HINT_GUIDANCE[hintLevel] + priorNote,
    answered,
    correct,
  };
}

/** The end-of-material response. Not an error: a finished deck is a good outcome. */
function noMoreConcepts(session: TutorSession): Record<string, unknown> {
  return {
    done: true,
    guidance:
      "You have been through everything they have. Tell them that, say briefly how they did, and ask whether they want another pass over the shaky ones or to stop there.",
    answered: session.attempts.length,
    correct: session.attempts.filter((a) => a.verdict === "correct").length,
  };
}

function toVerdict(value: unknown): Verdict {
  const allowed: Verdict[] = ["correct", "partial", "incorrect", "unknown"];
  return allowed.includes(value as Verdict) ? (value as Verdict) : "partial";
}

function toRequest(value: unknown): StudentRequest | null {
  const allowed: StudentRequest[] = ["harder", "easier", "repeat", "explain", "skip"];
  return allowed.includes(value as StudentRequest) ? (value as StudentRequest) : null;
}

/**
 * Apply one tool call and produce the response the model gets back.
 *
 * Pure: session in, session out. Every branch of the tutoring loop is
 * therefore reachable from a unit test, which is the only reason any of this
 * behaviour is verified at all -- none of it can be exercised by clicking
 * around without a microphone and ten minutes of talking.
 */
export function resolveToolCall(
  session: TutorSession,
  name: string,
  rawArgs: unknown,
  now: number
): ToolResult {
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<
    string,
    unknown
  >;

  const style = session.requests.includes("skip") ? "adaptive" : "adaptive";

  const advance = (base: TutorSession): ToolResult => {
    const concept = selectNextConcept(base, { style });
    if (!concept) {
      return { session: base, output: noMoreConcepts(base), activeConcept: null };
    }

    // Reading the hint level BEFORE recording the ask, because recordAsked
    // does not touch consecutiveMisses and we want the level the student is
    // actually on, not one computed from a half-updated row.
    const hintLevel = hintLevelFor(base.progress[concept.id]);
    const next = recordAsked(base, concept.id);

    return {
      session: next,
      output: { next: describeMove(next, concept, hintLevel) },
      activeConcept: concept,
    };
  };

  switch (name) {
    case TOOL_RECORD_ANSWER: {
      const conceptId = String(args.concept_id || session.activeConceptId || "");
      const verdict = toVerdict(args.verdict);
      const misconception =
        typeof args.misconception === "string" ? args.misconception.slice(0, 160) : null;

      if (!conceptId || !session.progress[conceptId]) {
        // The model named a concept we do not have. Do not corrupt state
        // with it; just get it back onto real material.
        return advance(session);
      }

      const recorded = recordAttempt(session, {
        conceptId,
        verdict,
        misconception,
        atMs: now,
      });

      return advance(recorded);
    }

    case TOOL_NEXT_QUESTION:
      return advance(session);

    case TOOL_NOTE_REQUEST: {
      const kind = toRequest(args.kind);
      if (!kind) return advance(session);

      const noted = recordRequest(session, kind);

      // "Repeat" and "explain" are about the question already on the table,
      // so they must not pull a new concept off the queue -- doing that is
      // how a tutor answers "sorry, what?" by changing the subject.
      if (kind === "repeat" || kind === "explain") {
        const active = noted.concepts.find((c) => c.id === noted.activeConceptId) || null;
        return {
          session: noted,
          output: {
            acknowledged: kind,
            guidance:
              kind === "repeat"
                ? "Say the same question again, more slowly and in simpler words. Do not answer it."
                : "Explain the idea simply and briefly, then check they followed by asking them to put it in their own words.",
            topic: active?.label ?? null,
            material: active?.facts ?? [],
          },
          activeConcept: active,
        };
      }

      if (kind === "skip") {
        // Skipping does not mean the concept is known. Park it and move on;
        // it stays in the pool for a later pass.
        const parked: TutorSession = {
          ...noted,
          activeConceptId: null,
        };
        return advance(parked);
      }

      const result = advance(noted);
      return {
        ...result,
        output: { ...result.output, acknowledged: kind, difficulty: noted.difficulty },
      };
    }

    default:
      // An unknown tool name is a model mistake, not a crash. Keep teaching.
      return advance(session);
  }
}

/** Convenience for the UI: the live mastery rows, already sorted for display. */
export function liveMastery(session: TutorSession) {
  return masteryEstimates(session)
    .filter((row) => row.state !== "unseen")
    .sort((a, b) => a.percent - b.percent);
}
