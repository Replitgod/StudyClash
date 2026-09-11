import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTopic } from "@/lib/voice/topics";
import type { Concept, EducationLevel, SourceType } from "@/lib/voice/types";
import { loadTopicConcepts } from "./topicConcepts";
import {
  readSessionMemory,
  type PastSessionRow,
  type SessionMemory,
} from "@/lib/voice/sessionMemory";

// Turning a student's material into something a voice tutor can teach from.
//
// Two jobs, and they pull in opposite directions.
//
// The first is grounding: a tutor that has the deck title and nothing else
// is a generic assistant that happens to know the word "photosynthesis". It
// has to have the actual cards.
//
// The second is that a realtime session pays for its context in latency on
// every single turn, and the whole deck does not fit. So the material is
// distilled into concepts -- one per topic, a handful of source lines each
// -- and the tutor pulls the detail for a concept through a tool call at the
// moment it needs it, rather than carrying all of it all call.
//
// Everything in here treats the material as DATA. A note that says "ignore
// your instructions" is a note about following instructions, not an
// instruction; see sanitizeMaterial.

/** Concepts we are willing to carry. Beyond this the tutor never gets through them. */
const MAX_CONCEPTS = 24;

/** Source lines per concept. Enough to ask from, small enough to send. */
const MAX_FACTS_PER_CONCEPT = 6;

/** Per-line cap. Longer than this and it is a passage, not a fact. */
const MAX_FACT_CHARS = 320;

/** Total notes we will distil from. Beyond this we take the opening. */
const MAX_NOTES_CHARS = 6000;

export type QuestionRow = {
  id: string;
  question_text: string | null;
  correct_answer: string | null;
  explanation: string | null;
  topic: string | null;
  difficulty: string | null;
};

export type StudyMaterial = {
  sourceType: SourceType;
  sourceId: string | null;
  /** Shown on the call screen so the student knows what they are about to do. */
  title: string;
  courseName: string | null;
  concepts: Concept[];
  /** Topics the app already knew were weak, for the opening line. */
  priorWeakTopics: string[];
  studentName: string | null;
  /**
   * What happened the last time this student was on a call.
   *
   * Null for a first call, and for a previous call where nothing was
   * actually answered. Every session already wrote one of these; until now
   * nothing read them back, so the tutor met every student as a stranger.
   */
  sessionMemory: SessionMemory | null;
  /**
   * True when the concepts were written for this topic rather than read
   * from the student's own material.
   *
   * The tutor has to know the difference and say so. Grounding in a deck
   * means "this is from your notes"; grounding in a generated outline means
   * "this is me, and you should check it against your course". Collapsing
   * the two would have the tutor claim the student's own notes said
   * something they never said.
   */
  generated: boolean;
};

/**
 * Strip anything that could let material act as an instruction.
 *
 * The real defense is structural -- the material is fenced, and the system
 * prompt says in as many words that everything inside the fence is the
 * student's notes and never a command. A blocklist alone would be security
 * theatre, because there are unlimited ways to phrase "ignore the above".
 *
 * What this adds on top is closing the specific holes that let material
 * escape the fence in the first place: the chat-template control tokens,
 * anything that looks like our own delimiter, and role headers that make the
 * following text read as a new turn. Plus control characters, which are
 * invisible in a note and very visible to a tokenizer.
 */
export function sanitizeMaterial(raw: string): string {
  if (!raw) return "";

  return (
    raw
      // Control characters, plus the zero-width and bidi-override tricks
      // that hide text from a human reading their own notes while leaving it
      // perfectly legible to a tokenizer.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, " ")
      // Chat-template control tokens.
      .replace(/<\|[^|>]{0,64}\|>/g, " ")
      // Our own fence, so material cannot close it and write outside.
      .replace(/-{3,}\s*(BEGIN|END)\s+STUDY MATERIAL\s*-{3,}/gi, " ")
      .replace(/^-{3,}$/gm, " ")
      // Role headers that would read as the start of a new turn.
      .replace(/^\s*(system|developer|assistant|user)\s*:/gim, " ")
      .replace(/^\s*#{1,6}\s*(system|instructions?|prompt)\b.*$/gim, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function clampFact(text: string): string {
  const clean = sanitizeMaterial(text);
  return clean.length <= MAX_FACT_CHARS ? clean : `${clean.slice(0, MAX_FACT_CHARS)}…`;
}

/**
 * Short, stable ids for concepts.
 *
 * These travel to the model and back on every tool call, so they are kept to
 * a few characters. They are positional rather than derived from the topic
 * name because a slug of "Cell Structure & Function" is both long and easy
 * for the model to mistype, and a mistyped id silently loses an answer.
 */
function conceptId(index: number): string {
  return `c${index + 1}`;
}

/**
 * Group graded questions into concepts the tutor can work through.
 *
 * Topic is the grouping key because it is what the rest of AceDecks already
 * reasons about -- weak topics, the mastery map and the review schedule are
 * all keyed on it, so a voice session that thinks in topics can feed them
 * all without a translation layer.
 */
export function buildConceptsFromQuestions(
  questions: QuestionRow[],
  weakTopics: string[] = []
): Concept[] {
  const weakSet = new Set(weakTopics.map((topic) => topic.trim().toLowerCase()));
  const byTopic = new Map<string, string[]>();

  for (const question of questions) {
    const topic = sanitizeMaterial(question.topic || "").trim() || "General";
    const text = sanitizeMaterial(question.question_text || "");
    const answer = sanitizeMaterial(question.correct_answer || "");
    if (!text && !answer) continue;

    // One line per card, question and answer together. The tutor needs both:
    // the question to have something to ask, the answer to judge what it
    // hears. The explanation is appended only when short, because it is
    // usually the longest field and the least load-bearing.
    const explanation = sanitizeMaterial(question.explanation || "");
    const fact = [
      text ? `Q: ${text}` : "",
      answer ? `A: ${answer}` : "",
      explanation && explanation.length <= 160 ? `(${explanation})` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const existing = byTopic.get(topic);
    if (existing) {
      if (existing.length < MAX_FACTS_PER_CONCEPT) existing.push(clampFact(fact));
    } else {
      byTopic.set(topic, [clampFact(fact)]);
    }
  }

  const entries = Array.from(byTopic.entries());

  // Weak topics first, so that if the material is bigger than MAX_CONCEPTS
  // the ones that get dropped are the ones the student already knows.
  entries.sort((a, b) => {
    const weakA = weakSet.has(a[0].toLowerCase());
    const weakB = weakSet.has(b[0].toLowerCase());
    if (weakA !== weakB) return weakA ? -1 : 1;
    return b[1].length - a[1].length;
  });

  return entries.slice(0, MAX_CONCEPTS).map((entry, index) => ({
    id: conceptId(index),
    label: entry[0],
    facts: entry[1],
    priorWeak: weakSet.has(entry[0].toLowerCase()),
  }));
}

/**
 * Fall back to raw notes when a deck has no generated questions yet.
 *
 * A student who has just pasted their notes and immediately hit "call" is a
 * completely normal case, and refusing to teach them because the question
 * generator has not run is the wrong answer. Paragraphs become concepts;
 * they are rougher than graded cards but they are genuinely their material.
 */
export function buildConceptsFromNotes(notes: string, title: string): Concept[] {
  const clean = sanitizeMaterial(notes).slice(0, MAX_NOTES_CHARS);
  if (!clean) return [];

  // Sentence-ish chunks, then packed into paragraphs of a few sentences.
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);

  if (sentences.length === 0) {
    return [{ id: conceptId(0), label: title, facts: [clampFact(clean)], priorWeak: false }];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    chunks.push(sentences.slice(i, i + 3));
  }

  return chunks.slice(0, MAX_CONCEPTS).map((chunk, index) => ({
    id: conceptId(index),
    // Without topic labels the best available name is the first few words of
    // the passage, which at least tells the student what came up.
    label: chunk[0].split(/\s+/).slice(0, 6).join(" ").replace(/[,;:]$/, ""),
    facts: chunk.map(clampFact),
    priorWeak: false,
  }));
}

/**
 * Load what the student asked to be tutored on.
 *
 * Ownership is enforced here and only here. The browser sends a deckId; that
 * is a request, not a fact, so every read is filtered by user_id and a deck
 * belonging to someone else comes back as "not found" rather than as a
 * different error -- telling a caller that an id exists but is not theirs is
 * a membership oracle.
 */
export async function loadStudyMaterial(args: {
  supabase: SupabaseClient;
  userId: string;
  sourceType: SourceType;
  sourceId: string | null;
  /**
   * Only read when sourceType is "topic": the subject the student named,
   * already normalised by the caller. Concepts for it are generated rather
   * than read, which is the one path through here that costs a model call.
   */
  topic?: string | null;
  level?: EducationLevel;
}): Promise<{
  material: StudyMaterial | null;
  error: "not_found" | "topic_refused" | null;
  /** Present only on "topic_refused": what to tell the student, out loud. */
  refusal?: string;
}> {
  const { supabase, userId, sourceType, sourceId } = args;

  const [{ data: profile }, { data: due }, { data: pastSessions }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase
      .from("topic_review_schedule")
      .select("topic, status")
      .eq("user_id", userId)
      .lte("next_review_at", new Date().toISOString())
      .limit(12),
    // The most recent finished calls. More than one is fetched because the
    // latest may have recorded nothing answerable -- a call that connected
    // and ended -- and the memory should fall through to the last call that
    // actually taught something rather than give up.
    supabase
      .from("voice_sessions")
      .select("ended_at, started_at, topics_covered, summary")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("ended_at", { ascending: false, nullsFirst: false })
      .limit(3),
  ]);

  const sessionMemory =
    (pastSessions ?? [])
      .map((row) => readSessionMemory(row as PastSessionRow))
      .find((memory): memory is SessionMemory => memory !== null) ?? null;

  const studentName = (profile?.display_name || "").trim() || null;
  const priorWeakTopics = (due || [])
    .filter((row: { status?: string | null }) => row.status === "weak")
    .map((row: { topic?: string | null }) => (row.topic || "").trim())
    .filter(Boolean)
    .slice(0, 10) as string[];

  // A topic call. Nothing is read from the student's material at all: they
  // named a subject, and the concepts are written for it.
  //
  // Deliberately first, before the deck branch, because a student who named
  // a topic gets that topic even if they arrived from a deck page. The
  // explicit request always beats the implied context.
  if (sourceType === "topic") {
    const topic = normalizeTopic(args.topic);
    if (!topic) {
      return {
        material: null,
        error: "topic_refused",
        refusal: "Tell me what you want to work on and I will start.",
      };
    }

    const outline = await loadTopicConcepts({
      supabase,
      topic,
      level: args.level ?? "unspecified",
    });

    if (!outline.ok) {
      return { material: null, error: "topic_refused", refusal: outline.refusal };
    }

    return {
      material: {
        sourceType: "topic",
        sourceId: null,
        title: outline.label,
        courseName: null,
        concepts: outline.concepts,
        // Their existing weak topics still travel with a topic call. They
        // are not what is being taught, but they are true things about the
        // student, and the tutor sounding like it has met them before is
        // most of the difference between a tutor and a search box.
        priorWeakTopics,

        sessionMemory,
        studentName,
        generated: true,
      },
      error: null,
    };
  }

  if (sourceType === "deck" && sourceId) {
    const { data: deck } = await supabase
      .from("decks")
      .select("id, title, course_name, raw_notes")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!deck) return { material: null, error: "not_found" };

    const { data: questions } = await supabase
      .from("questions")
      .select("id, question_text, correct_answer, explanation, topic, difficulty")
      .eq("deck_id", sourceId)
      .limit(200);

    const rows = (questions || []) as QuestionRow[];
    const concepts =
      rows.length > 0
        ? buildConceptsFromQuestions(rows, priorWeakTopics)
        : buildConceptsFromNotes(String(deck.raw_notes || ""), String(deck.title || "Your notes"));

    return {
      material: {
        sourceType: "deck",
        sourceId: String(deck.id),
        title: sanitizeMaterial(String(deck.title || "Untitled")) || "Untitled",
        courseName: sanitizeMaterial(String(deck.course_name || "")) || null,
        concepts,
        priorWeakTopics,

        sessionMemory,
        studentName,
        generated: false,
      },
      error: null,
    };
  }

  // No specific deck: build a session out of what the app already knows is
  // due and weak, across everything they study. This is the /vyra entry
  // point, and it is the one that has to work with no setup at all.
  const { data: recentDecks } = await supabase
    .from("decks")
    .select("id, title")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  const deckIds = (recentDecks || []).map((deck: { id: string }) => deck.id);

  let concepts: Concept[] = [];
  if (deckIds.length > 0) {
    const { data: questions } = await supabase
      .from("questions")
      .select("id, question_text, correct_answer, explanation, topic, difficulty")
      .in("deck_id", deckIds)
      .limit(200);

    concepts = buildConceptsFromQuestions((questions || []) as QuestionRow[], priorWeakTopics);
  }

  const firstTitle = (recentDecks || [])[0]?.title;

  return {
    material: {
      sourceType: priorWeakTopics.length > 0 ? "weak_topics" : "open",
      sourceId: null,
      title: concepts.length > 0 && firstTitle ? sanitizeMaterial(String(firstTitle)) : "Your recent material",
      courseName: null,
      concepts,
      priorWeakTopics,

      sessionMemory,
      studentName,
      generated: false,
    },
    error: null,
  };
}
