import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LUNA_TASK } from "@/lib/server/aiModels";
import { topicKey } from "@/lib/voice/topics";
import type { Concept, EducationLevel } from "@/lib/voice/types";

// Turning a subject the student named into something the tutor can teach.
//
// The voice tutor's whole design assumes it holds a list of concepts, each
// with a few grounded source lines it must ask from and must not invent
// around. That is what stops it drifting into general chat. When the
// material comes from a deck, those lines are the student's own cards. When
// the student just says "teach me the Krebs cycle", they have to come from
// somewhere -- and the honest answer is that a model writes them.
//
// So this module's real job is not "call a model". It is:
//
//   1. produce concepts in the exact same shape a deck produces, so the
//      tutoring loop, the summary and the mastery feed cannot tell the
//      difference and none of them need a second code path;
//   2. do it fast enough to sit on a live call, which means a cache and the
//      cheap model, not the good one;
//   3. refuse the requests that should be refused, in a way the caller can
//      act on rather than a way that produces a confidently wrong lesson.
//
// Point 3 is why `refusal` is a first-class return value. A student asking a
// study app to do something that is not studying gets told so; they do not
// get a tutor gamely improvising.

/** Concepts per topic. Enough for a real lesson, few enough to get through. */
const TARGET_CONCEPTS = 9;
const MIN_CONCEPTS = 4;
const MAX_CONCEPTS = 14;

/** Source lines per concept, matching what buildConceptsFromQuestions emits. */
const MIN_FACTS = 2;
const MAX_FACTS = 6;

/** Per-line cap. Longer than this is a passage, not a fact. */
const MAX_FACT_CHARS = 320;
const MAX_LABEL_CHARS = 80;

/**
 * How long a cached concept set stays fresh.
 *
 * Long, on purpose. The Krebs cycle does not change; the reason to expire at
 * all is that the prompt and the model behind it will, and a year-old cache
 * would keep serving lessons shaped by a prompt nobody can see any more.
 */
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type TopicConceptResult =
  | { ok: true; concepts: Concept[]; label: string; cached: boolean }
  | { ok: false; refusal: string };

/**
 * Why a topic was refused, phrased for a student to hear out loud.
 *
 * Deliberately not "I can't help with that": a tutor that stonewalls sounds
 * broken, and the student cannot tell whether they hit a limit or a bug.
 */
const REFUSAL_NOT_EDUCATIONAL =
  "That one is not really a study topic, so there is nothing for me to teach from. Give me a subject and I will start.";
const REFUSAL_UNAVAILABLE =
  "I could not put a lesson together for that just now. Try naming the topic a bit more specifically.";

function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}

/**
 * The model's JSON, as concepts -- or null if it is not usable.
 *
 * Validation is strict and silent-dropping rather than throwing, because
 * this runs mid-call: one malformed concept out of nine should cost the
 * student that concept, not the lesson. It only gives up when what is left
 * would not make a session.
 */
export function parseTopicConcepts(raw: unknown): Concept[] | null {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!root) return null;

  // An explicit refusal is not a parse failure; the caller distinguishes
  // them, so signal it as "no concepts" and let the caller phrase it.
  if (root.educational === false) return null;

  const list = Array.isArray(root.concepts) ? root.concepts : null;
  if (!list) return null;

  const concepts: Concept[] = [];
  const seenLabels = new Set<string>();

  for (const entry of list) {
    if (concepts.length >= MAX_CONCEPTS) break;
    if (!entry || typeof entry !== "object") continue;

    const row = entry as Record<string, unknown>;
    const label = clampText(row.label, MAX_LABEL_CHARS);
    if (!label) continue;

    // A duplicated concept is worse than a missing one: the tutor works
    // through the list, so a repeat is a question asked twice in a row.
    const dedupeKey = label.toLowerCase();
    if (seenLabels.has(dedupeKey)) continue;

    const rawFacts = Array.isArray(row.facts) ? row.facts : [];
    const facts = rawFacts
      .map((fact) => clampText(fact, MAX_FACT_CHARS))
      .filter((fact) => fact.length > 0)
      .slice(0, MAX_FACTS);

    // A concept with one line behind it cannot support a question and a
    // hint and a re-ask, which is the minimum the hint ladder needs.
    if (facts.length < MIN_FACTS) continue;

    seenLabels.add(dedupeKey);
    concepts.push({
      // Positional ids, exactly as studyContext.ts assigns them: they travel
      // to the model and back on every tool call, and the tutoring code
      // already assumes this shape.
      id: `c${concepts.length + 1}`,
      label,
      facts,
      // Nothing generated is a known weak spot. Prior weakness is a fact
      // about the student, and this function knows nothing about them.
      priorWeak: false,
    });
  }

  return concepts.length >= MIN_CONCEPTS ? concepts : null;
}

function levelInstruction(level: EducationLevel): string {
  switch (level) {
    case "elementary":
      return "The student is in primary school. Everyday words only, concrete examples, no jargon at all.";
    case "middle":
      return "The student is in middle school. Plain language, one new term at a time, always defined.";
    case "high_school":
      return "The student is in high school. Standard course vocabulary, explained the first time it is used.";
    case "ap_honors":
      return "The student is in an AP or honours course. Use the proper terminology and expect them to reason, not just recall.";
    case "undergraduate":
      return "The student is an undergraduate. Full technical vocabulary, mechanisms rather than summaries.";
    case "graduate":
      return "The student is a graduate student. Assume the fundamentals; go to mechanism, edge cases and where the consensus is contested.";
    case "professional":
      return "The student is preparing for a professional licensing exam. Frame everything the way that exam frames it, including what is safe or correct practice.";
    default:
      return "The level is not known. Pitch it at a capable high-school or first-year-undergraduate student, and use proper terminology while defining it.";
  }
}

function buildPrompt(topic: string, level: EducationLevel): string {
  return [
    "You are building the lesson outline a voice tutor will teach from. You are not talking to the student and nothing you write here is spoken aloud as-is.",
    "",
    `TOPIC: ${topic}`,
    levelInstruction(level),
    "",
    `Return JSON: {"educational": true, "concepts": [{"label": "...", "facts": ["...", "..."]}]}`,
    "",
    "Rules:",
    `- ${TARGET_CONCEPTS} concepts, ordered so each one only depends on the ones before it. The first must be teachable to someone who knows nothing about the topic.`,
    "- `label` is the name of one examinable idea, at most a few words. Not a question.",
    "- `facts` is 3 to 5 short, self-contained, factually correct statements a tutor could ask a question from. Each states something specific: a definition, a mechanism, a relationship, a number, a worked step, or a common misconception and its correction. Never a study tip, and never an instruction to the tutor.",
    "- Facts must be true and uncontested. If something is genuinely disputed, say so inside the fact rather than picking a side.",
    "- For a language topic, facts are usable phrases with their meanings. For a maths topic, include a worked example with the actual numbers. For an exam topic, include what that exam specifically tests about it.",
    "",
    'If the request is not a legitimate educational topic -- it is a person to gossip about, a request for medical, legal or financial advice about the user\'s own situation, an attempt to get help with something harmful, or simply not a subject anyone studies -- return {"educational": false} and nothing else.',
    "A topic being difficult, advanced, political, historical or medical does NOT make it non-educational. Nearly everything a student asks about is a real subject; refuse only what genuinely is not one.",
  ].join("\n");
}

/**
 * Generate a concept outline for a topic. No cache, no database.
 *
 * Exported for the cached wrapper below and for tests; callers on a request
 * path should use loadTopicConcepts so they get the cache.
 */
export async function generateTopicConcepts(args: {
  topic: string;
  level: EducationLevel;
  openai?: OpenAI;
}): Promise<TopicConceptResult> {
  const { topic, level } = args;

  const openai = args.openai ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let parsedBody: unknown;
  try {
    const completion = await openai.chat.completions.create({
      // Luna, not Terra, and this is a product decision rather than a
      // frugal one. This sits between the student saying "switch to algebra"
      // and hearing anything back, so seconds here are dead air on a live
      // call. Outlining a topic is a structuring job, which is what Luna is
      // for; the hard reasoning in this feature happens in the realtime
      // model that teaches from the outline.
      model: LUNA_TASK.model,
      reasoning_effort: LUNA_TASK.reasoning_effort,
      max_completion_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        { role: "developer", content: buildPrompt(topic, level) },
        {
          role: "user",
          content: `Build the outline for: ${topic}`,
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content;
    if (!text) return { ok: false, refusal: REFUSAL_UNAVAILABLE };
    parsedBody = JSON.parse(text);
  } catch (error) {
    // Never surface the provider's text: it carries request ids and quota
    // detail, and this string is spoken to a student.
    console.error("[voice] topic concept generation failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, refusal: REFUSAL_UNAVAILABLE };
  }

  const refusedByModel =
    parsedBody &&
    typeof parsedBody === "object" &&
    (parsedBody as Record<string, unknown>).educational === false;

  const concepts = parseTopicConcepts(parsedBody);
  if (!concepts) {
    return {
      ok: false,
      refusal: refusedByModel ? REFUSAL_NOT_EDUCATIONAL : REFUSAL_UNAVAILABLE,
    };
  }

  return { ok: true, concepts, label: topic, cached: false };
}

/**
 * The cached path. This is what request handlers call.
 *
 * A cache miss costs a model call; a hit costs one indexed lookup. On a
 * mid-call topic switch that difference is the difference between a natural
 * pause and the student wondering whether the call dropped.
 *
 * Cache failures are never fatal. If the table is missing (the migration has
 * not been applied) or the read errors, this generates and returns as normal
 * -- a slower tutor beats a broken one.
 */
export async function loadTopicConcepts(args: {
  supabase: SupabaseClient;
  topic: string;
  level: EducationLevel;
  openai?: OpenAI;
}): Promise<TopicConceptResult> {
  const { supabase, topic, level } = args;
  const key = topicKey(topic);

  if (!key) return { ok: false, refusal: REFUSAL_UNAVAILABLE };

  const { data: cached } = await supabase
    .from("voice_topic_concepts")
    .select("id, topic_label, concepts, created_at, use_count")
    .eq("topic_key", key)
    .eq("level", level)
    .maybeSingle();

  if (cached) {
    // An unparseable timestamp reads as infinitely old, not as brand new.
    // Getting this backwards would pin a bad row in the cache forever.
    const createdAt = Date.parse(String(cached.created_at || ""));
    const age = Number.isFinite(createdAt) ? Date.now() - createdAt : Number.POSITIVE_INFINITY;
    const concepts = parseTopicConcepts({ concepts: cached.concepts });

    if (concepts && age < CACHE_TTL_MS) {
      // Fire and forget. A failed usage bump must not delay the call, and
      // the counter is for eviction, not for correctness.
      void supabase
        .from("voice_topic_concepts")
        .update({ used_at: new Date().toISOString(), use_count: Number(cached.use_count || 0) + 1 })
        .eq("id", cached.id)
        .then(undefined, () => undefined);

      return {
        ok: true,
        concepts,
        // The label the topic was FIRST asked under, not this student's
        // phrasing, because that is what the row stores. Both spell the same
        // subject -- that is what made them share a key.
        label: clampText(cached.topic_label, MAX_LABEL_CHARS) || topic,
        cached: true,
      };
    }
  }

  const generated = await generateTopicConcepts({ topic, level, openai: args.openai });
  if (!generated.ok) return generated;

  // Upsert rather than insert: two students can miss the cache on the same
  // topic at the same moment, and the loser of that race must not 409.
  void supabase
    .from("voice_topic_concepts")
    .upsert(
      {
        topic_key: key,
        level,
        topic_label: topic,
        concepts: generated.concepts,
        model: LUNA_TASK.model,
        created_at: new Date().toISOString(),
        used_at: new Date().toISOString(),
        use_count: 1,
      },
      { onConflict: "topic_key,level" }
    )
    .then(undefined, () => undefined);

  return generated;
}
