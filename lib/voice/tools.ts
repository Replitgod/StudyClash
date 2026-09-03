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
            "correct = the idea is there, even if loosely or informally worded. partial = they produced real content and SOME of the idea is in it. incorrect = they produced real content but the idea is genuinely not there. unknown = they did not attempt an answer at all: 'I don't know', 'no idea', 'pass', 'you tell me', a shrug, or silence. Never mark a non-answer as partial — a student who did not answer did not half-answer, and treating it as one makes you congratulate them for nothing.",
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
  /**
   * How to respond to what the student just said.
   *
   * Separate from `guidance` because they answer different questions, and
   * collapsing them caused the worst bug this feature has had: guidance was
   * keyed on the hint ladder alone, so "I don't know" and a confident wrong
   * answer produced identical instructions ("tease them warmly, then hint").
   * The tutor replied to silence with "ooh, so close" -- congratulating a
   * student for an answer they never gave. Nothing makes a tutor sound more
   * like a script being read at you.
   */
  reaction: string;
  /** What to ask next, and how much help to give while asking it. */
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
    "Do NOT give the answer. Give one small hint that narrows it down, then ask again.",
  concept:
    "Second time on this. Give a more specific conceptual hint — point at the underlying idea — then ask again.",
  breakdown:
    "Third time. Break the problem into steps and ask them only the first step. Small, answerable.",
  explain:
    "They are stuck. Explain the idea clearly and quickly — one breath, no lecture — then immediately ask a NEW short question on the same idea in different words so they still have to retrieve it.",
};

/**
 * How to respond to what the student actually said.
 *
 * Every one of these exists to stop the tutor reacting to an answer that was
 * not given. A reaction that does not match the input is the single loudest
 * tell that there is no one home -- a student who says "no idea" and is told
 * they were *close* learns instantly that nothing is listening, and after
 * that the encouragement is worthless even when it is deserved.
 */
const REACTION: Record<Verdict, string> = {
  correct:
    "They got it right. React briefly and genuinely — vary it, never the same celebration twice in one call — and do NOT explain what they have just demonstrated they know. Then move on.",
  partial:
    "They gave you PART of the right idea. Name the piece that actually landed, in their own words, then ask only for what is missing. This is the one situation where 'close' is true, so it is the only situation you may say it.",
  incorrect:
    "They gave a real answer and it was wrong. Say so plainly and warmly — 'nope', 'not that one', 'other way round'. Only say they were close if what they said genuinely was near it; false encouragement is patronising and teaches nothing.",
  unknown:
    "They told you they do not know, or said nothing usable. They did NOT attempt an answer, so do not react as if they had: no 'so close', no 'not quite', no 'almost', no praise. Acknowledge it in two or three words — 'No shame.' / 'Fair enough.' / 'Okay, no problem.' — and go straight to helping.",
};

function describeMove(
  session: TutorSession,
  concept: Concept,
  hintLevel: HintLevel,
  /** What the student just did. Null when there is nothing to react to yet. */
  lastVerdict: Verdict | null,
  /** True when this is the same concept they were just working on. */
  staying: boolean
): NextMove {
  const answered = session.attempts.length;
  const correct = session.attempts.filter((a) => a.verdict === "correct").length;

  const progress = session.progress[concept.id];
  const priorNote =
    // Only for a genuine revisit later in the call. Saying "come at it from
    // a different angle" while still finishing the current thread reads as
    // an instruction to change the subject mid-answer.
    !staying && progress && progress.asked > 1
      ? " You have asked about this before in this call — come at it from a different angle this time."
      : concept.priorWeak && progress && progress.asked <= 1
        ? " They have got this wrong in past study sessions, so expect it to be shaky."
        : "";

  const guidance =
    // A half-answer is not a fresh question. Re-asking the whole thing makes
    // the student repeat the part they already got right, which is the exact
    // opposite of "say which part landed, now give me the rest".
    staying && lastVerdict === "partial"
      ? "Ask ONLY for the piece they missed. Do not re-ask the whole question — they already gave you half of it."
      : HINT_GUIDANCE[hintLevel] + priorNote;

  return {
    concept_id: concept.id,
    topic: concept.label,
    material: concept.facts,
    hint_level: hintLevel,
    reaction: lastVerdict
      ? REACTION[lastVerdict]
      : answered === 0
        ? "This is the first question of the call. One short greeting, then ask it."
        : "Nothing to react to — move straight on with no filler.",
    guidance,
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
  if (allowed.includes(value as Verdict)) return value as Verdict;

  // "unknown", not "partial". The old default meant that any verdict we
  // could not read became "they got part of it right", and the tutor
  // congratulated a student who had said nothing. When we do not know what
  // happened, the safe reaction is to help, never to praise.
  return "unknown";
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
export type ToolContext = {
  /**
   * Has the microphone actually picked up the student since the current
   * question was asked?
   *
   * The app knows this and the model does not, which is exactly why the check
   * belongs here. Left undefined it defaults to true, so a caller that cannot
   * tell keeps the old behaviour.
   */
  studentSpokeSinceAsk?: boolean;
};

export function resolveToolCall(
  session: TutorSession,
  name: string,
  rawArgs: unknown,
  now: number,
  context: ToolContext = {}
): ToolResult {
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<
    string,
    unknown
  >;

  const style = session.requests.includes("skip") ? "adaptive" : "adaptive";

  const advance = (base: TutorSession, lastVerdict: Verdict | null = null): ToolResult => {
    // A question that was asked and never answered must not be abandoned.
    //
    // The opening question is baked into the session instructions rather than
    // fetched through a tool, so a model that calls next_question out of
    // habit would otherwise be handed a second topic and ask two questions
    // back to back before the student had answered either. Handing the same
    // concept back is the recovery. Skipping is unaffected: note_request
    // clears activeConceptId first, which is exactly what distinguishes
    // "move on" from "I forgot I already asked".
    const activeId = base.activeConceptId;
    const active = activeId ? base.progress[activeId] : null;
    const unanswered =
      active && active.asked > 0 && base.attempts.every((a) => a.conceptId !== activeId);

    if (lastVerdict === null && unanswered) {
      const concept = base.concepts.find((c) => c.id === activeId);
      if (concept) {
        return {
          session: base,
          output: {
            next: describeMove(base, concept, hintLevelFor(active), null, true),
          },
          activeConcept: concept,
        };
      }
    }

    const concept = selectNextConcept(base, { style });
    if (!concept) {
      return {
        session: base,
        output: { ...noMoreConcepts(base), reaction: lastVerdict ? REACTION[lastVerdict] : "" },
        activeConcept: null,
      };
    }

    // Reading the hint level BEFORE recording the ask, because recordAsked
    // does not touch consecutiveMisses and we want the level the student is
    // actually on, not one computed from a half-updated row.
    const hintLevel = hintLevelFor(base.progress[concept.id]);
    const staying = base.activeConceptId === concept.id;
    const next = recordAsked(base, concept.id);

    return {
      session: next,
      output: { next: describeMove(next, concept, hintLevel, lastVerdict, staying) },
      activeConcept: concept,
    };
  };

  switch (name) {
    case TOOL_RECORD_ANSWER: {
      // Nothing was said, so there is nothing to grade.
      //
      // A model with no new input will still cheerfully report a verdict --
      // it continues the dialogue because that is what continuing looks like.
      // Left unchecked that writes an answer the student never gave into
      // their mastery estimate and into the end-of-session review, which is a
      // far worse failure than the awkward silence it came from: the numbers
      // stop describing the student.
      //
      // The app knows whether the microphone heard anything and the model
      // does not, so this is refused here rather than discouraged in the
      // prompt.
      if (context.studentSpokeSinceAsk === false) {
        const active =
          session.concepts.find((c) => c.id === session.activeConceptId) || null;

        return {
          session,
          output: {
            recorded: false,
            reason: "the_student_has_not_answered",
            reaction:
              "The student has said NOTHING since you asked — the microphone picked up no speech at all. They have not answered, so there is no verdict and it was not recorded. Do not say 'good choice', 'exactly', 'close', 'not quite' or anything else implying they replied, and do not thank them for an answer. Do not call record_answer again until they have actually said something.",
            guidance:
              "Either give one small hint for the question already on the table, or ask once whether they are still there. One short sentence, then wait.",
            topic: active?.label ?? null,
            material: active?.facts ?? [],
          },
          activeConcept: active,
        };
      }

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

      return advance(recorded, verdict);
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
