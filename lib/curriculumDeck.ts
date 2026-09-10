// Turning a processed course into cards a student actually reviews.
//
// The curriculum pipeline was doing real work and throwing it away. A PDF
// went through eight stages -- OCR, chunking, embeddings, summarization,
// concept mapping, coverage planning, question generation, verification --
// and landed in `curriculum_questions`, a table nothing in the study app
// reads. The course page let you expand a concept and look at the questions
// with the answers already showing. That is not retrieval practice; it is a
// document viewer with an expensive backend.
//
// Nothing that came out of an upload entered the SM-2 schedule, counted
// toward mastery, or reached Vyra. "What am I forgetting?" could not include
// anything a student had uploaded, which is most of what a student actually
// studies from.
//
// This module is the mapping between the two shapes. It is pure so the
// conversion can be tested without a database, because the failure mode that
// matters -- a card whose correct answer is not one of its options -- is
// silent, unanswerable, and would otherwise only surface when a student hit
// it mid-review.

/** A row from `curriculum_questions`, in the shape the pipeline writes. */
export type CurriculumQuestionRow = {
  id: string;
  concept_id: string | null;
  question_text: string;
  question_type: string;
  /** The generator writes `[{text, isCorrect}]`. */
  choices: unknown;
  /** For multiple choice this is the correct choice's TEXT, not a letter. */
  correct_answer: string | null;
  explanation: string;
  /** 1-5 in the curriculum schema; the deck schema uses words. */
  difficulty: number | null;
  common_mistake: string | null;
  status: string;
};

/** A row ready for `questions`, the table the study flow reads. */
export type DeckCardInsert = {
  deck_id: string;
  question_text: string;
  answer_choices: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  question_type: "multiple_choice";
  source_excerpt: string | null;
  source_curriculum_question_id: string;
};

export type SkipReason =
  | "not_approved"
  | "unsupported_type"
  | "too_few_choices"
  | "answer_not_among_choices"
  | "duplicate_choices"
  | "missing_text";

export type ConversionResult = {
  cards: Omit<DeckCardInsert, "deck_id">[];
  skipped: { id: string; reason: SkipReason }[];
};

/**
 * Only verified questions become cards.
 *
 * `question_verification` exists to catch a generated question that is
 * wrong, unsupported by the source, or a near-duplicate. Letting a
 * `pending_verification` row into a student's review schedule would waste
 * the one stage in the pipeline whose whole job is to stop that.
 */
const STUDYABLE_STATUS = "approved";

/**
 * The deck study flow renders multiple choice and open response, and an
 * open-response card is graded against `rubric_points` -- an ordered list of
 * the steps a correct answer must contain. `curriculum_questions` has an
 * explanation, which is prose written to be read after the fact, not a
 * rubric to grade against. Converting one into the other would mean
 * inventing grading criteria and calling them verified.
 *
 * So free-response types are skipped and counted, not silently dropped and
 * not faked. Converting them properly needs a rubric-synthesis step of its
 * own.
 */
const CONVERTIBLE_TYPE = "multiple_choice";

/** The curriculum scale is 1-5; the deck schema stores a word. */
export function mapDifficulty(value: number | null | undefined): "easy" | "medium" | "hard" {
  if (typeof value !== "number" || Number.isNaN(value)) return "medium";
  if (value <= 2) return "easy";
  if (value >= 4) return "hard";
  return "medium";
}

/**
 * The generator emits `[{text, isCorrect}]`; older or hand-edited rows may
 * hold plain strings. Both are accepted, anything else yields nothing and
 * the question is skipped rather than producing a card with no options.
 */
export function normalizeChoices(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object" && "text" in entry) {
        const text = (entry as { text: unknown }).text;
        return typeof text === "string" ? text.trim() : "";
      }
      return "";
    })
    .filter((text) => text.length > 0);
}

/**
 * The explanation a student sees after answering.
 *
 * `common_mistake` is the most useful field the pipeline produces and the
 * one with nowhere to go in the deck schema: it names the specific wrong
 * turn a student is likely to take. Appended rather than dropped, because
 * "here is why the tempting answer is wrong" is the part that changes what
 * someone does next time.
 */
export function buildExplanation(explanation: string, commonMistake: string | null): string {
  const base = (explanation || "").trim();
  const mistake = (commonMistake || "").trim();
  if (!mistake) return base;
  if (!base) return `Watch out: ${mistake}`;
  // Skip the addendum when the explanation already makes the same point.
  if (base.toLowerCase().includes(mistake.toLowerCase())) return base;
  return `${base}\n\nWatch out: ${mistake}`;
}

/**
 * Convert one course's verified questions into cards.
 *
 * `conceptNames` maps concept_id to its name, which becomes the card's
 * `topic`. That field is not cosmetic: weak-topic detection, the mastery
 * map, and rematch all group by topic, so a card with a vague or missing
 * topic is a card that can never show up as a weakness. A question whose
 * concept is unknown gets the course name rather than an empty string.
 */
export function convertCurriculumQuestions(args: {
  questions: CurriculumQuestionRow[];
  conceptNames: Map<string, string>;
  excerpts: Map<string, string>;
  fallbackTopic: string;
}): ConversionResult {
  const { questions, conceptNames, excerpts, fallbackTopic } = args;
  const cards: Omit<DeckCardInsert, "deck_id">[] = [];
  const skipped: { id: string; reason: SkipReason }[] = [];

  for (const question of questions) {
    if (question.status !== STUDYABLE_STATUS) {
      skipped.push({ id: question.id, reason: "not_approved" });
      continue;
    }
    if (question.question_type !== CONVERTIBLE_TYPE) {
      skipped.push({ id: question.id, reason: "unsupported_type" });
      continue;
    }

    const questionText = (question.question_text || "").trim();
    const correctAnswer = (question.correct_answer || "").trim();
    if (!questionText || !correctAnswer) {
      skipped.push({ id: question.id, reason: "missing_text" });
      continue;
    }

    const choices = normalizeChoices(question.choices);
    if (choices.length < 2) {
      skipped.push({ id: question.id, reason: "too_few_choices" });
      continue;
    }
    if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) {
      skipped.push({ id: question.id, reason: "duplicate_choices" });
      continue;
    }

    // The check this module exists for. The study flow matches the student's
    // selection against `correct_answer` by value, so a card whose answer is
    // not among its options cannot be answered correctly by anyone -- it
    // would just quietly mark every attempt wrong, drag the topic's mastery
    // down, and schedule the concept for more review because the student
    // "keeps failing" it.
    if (!choices.includes(correctAnswer)) {
      skipped.push({ id: question.id, reason: "answer_not_among_choices" });
      continue;
    }

    const topic =
      (question.concept_id && conceptNames.get(question.concept_id)?.trim()) || fallbackTopic;

    cards.push({
      question_text: questionText,
      answer_choices: choices,
      correct_answer: correctAnswer,
      explanation: buildExplanation(question.explanation, question.common_mistake),
      topic,
      difficulty: mapDifficulty(question.difficulty),
      question_type: "multiple_choice",
      source_excerpt: question.concept_id ? (excerpts.get(question.id) ?? null) : null,
      source_curriculum_question_id: question.id,
    });
  }

  return { cards, skipped };
}

/** Plain-English counts for the response, so the UI never has to guess. */
export function summarizeSkips(skipped: { reason: SkipReason }[]): Record<SkipReason, number> {
  const counts = {
    not_approved: 0,
    unsupported_type: 0,
    too_few_choices: 0,
    answer_not_among_choices: 0,
    duplicate_choices: 0,
    missing_text: 0,
  } satisfies Record<SkipReason, number>;

  for (const skip of skipped) counts[skip.reason] += 1;
  return counts;
}
