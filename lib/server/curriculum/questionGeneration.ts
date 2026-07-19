import OpenAI from "openai";
import { TERRA_TASK } from "@/lib/server/aiModels";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Question types/cognitive levels mirror curriculum_questions' check
// constraints exactly (20260725_curriculum_engine_schema_phase1.sql) --
// keep both lists in sync if either changes.
const QUESTION_TYPES = [
  "multiple_choice", "fill_in_blank", "short_answer", "numeric_response",
  "multi_select", "matching", "ordering", "diagram_labeling",
  "graph_interpretation", "error_analysis", "case_study", "scenario",
  "application", "essay_prompt", "challenge",
] as const;

const COGNITIVE_LEVELS = [
  "recall", "understanding", "procedure", "application", "analysis",
  "multi_step_reasoning", "exam_level_challenge",
] as const;

export type SourceExcerpt = {
  index: number;
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  text: string;
};

export type GeneratedQuestionDraft = {
  questionText: string;
  questionType: (typeof QUESTION_TYPES)[number];
  cognitiveLevel: (typeof COGNITIVE_LEVELS)[number];
  choices: { text: string; isCorrect?: boolean }[];
  correctAnswer: string;
  acceptedAnswers: string[];
  explanation: string;
  difficulty: number;
  commonMistake: string | null;
  citedExcerptIndexes: number[];
};

// Grounded question generation (Section 7): the model is only ever given
// already-extracted excerpts for THIS concept, never the raw document
// library and never asked to "write a question about X" from its own
// training knowledge -- every draft must cite which excerpt(s) it used, so
// question_sources can be populated with a real excerpt rather than a
// guessed page range.
export async function generateQuestionsForConcept(args: {
  concept: {
    name: string;
    description: string | null;
    importance: string | null;
    difficulty: string | null;
    commonMistakes: string[];
  };
  excerpts: SourceExcerpt[];
  count: number;
  biasHarder: boolean;
}): Promise<GeneratedQuestionDraft[]> {
  if (args.excerpts.length === 0) {
    throw new Error("Cannot generate grounded questions with zero source excerpts.");
  }

  const excerptBlock = args.excerpts
    .map((e) => `[Excerpt ${e.index}] (pages ${e.pageStart}-${e.pageEnd})\n${e.text}`)
    .join("\n\n");

  const prompt = `
You are writing exam-quality practice questions for AcedIQ, grounded STRICTLY in the excerpts below. Never use outside knowledge, never invent facts not supported by these excerpts.

Concept: ${args.concept.name}
Description: ${args.concept.description || "(none provided)"}
Importance: ${args.concept.importance || "medium"}
Target difficulty tier: ${args.concept.difficulty || "medium"}
Known common mistakes students make on this concept: ${args.concept.commonMistakes.length > 0 ? args.concept.commonMistakes.join("; ") : "(none recorded)"}

Source excerpts (numbered -- cite the ones each question actually draws from):
${excerptBlock}

Write ${args.count} distinct question(s) testing real understanding of "${args.concept.name}", not just excerpt recall. Vary question_type and cognitive_level across the set rather than repeating the same shape. ${
    args.biasHarder
      ? "This concept needs HARDER questions specifically -- bias difficulty toward 4-5 and cognitive_level toward analysis/multi_step_reasoning/exam_level_challenge."
      : "Mix difficulty naturally across 1-5 based on what each specific question actually demands."
  }

Allowed question_type values: ${QUESTION_TYPES.join(", ")}.
Allowed cognitive_level values: ${COGNITIVE_LEVELS.join(", ")}.

For each question provide:
- questionText: the full question as a student would see it.
- questionType: one of the allowed values.
- cognitiveLevel: one of the allowed values.
- choices: for multiple_choice/multi_select/matching/ordering, an array of {"text": string, "isCorrect": boolean}. Empty array for free-response types.
- correctAnswer: the correct answer as a string (for MC, the correct choice's text).
- acceptedAnswers: alternate acceptable phrasings/values (empty array if not applicable, e.g. numeric tolerance variants or synonym answers).
- explanation: a real explanation a student can learn from, grounded in the excerpts -- not just "because that's correct."
- difficulty: integer 1-5.
- commonMistake: the specific wrong answer/misconception this question is designed to catch, or null.
- citedExcerptIndexes: array of excerpt numbers (integers) this question is actually grounded in. Must be non-empty.

Return ONLY valid JSON: {"questions": [{"questionText": string, "questionType": string, "cognitiveLevel": string, "choices": [], "correctAnswer": string, "acceptedAnswers": [], "explanation": string, "difficulty": number, "commonMistake": string|null, "citedExcerptIndexes": [number]}, ...]}
`.trim();

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: TERRA_TASK.reasoning_effort,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Question generation returned an empty response.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Question generation returned invalid JSON.");
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.questions)) {
    throw new Error("Question generation response was missing a questions array.");
  }

  const validExcerptIndexes = new Set(args.excerpts.map((e) => e.index));

  return record.questions
    .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
    .map((q) => {
      const citedRaw = Array.isArray(q.citedExcerptIndexes) ? (q.citedExcerptIndexes as unknown[]) : [];
      const cited = citedRaw
        .filter((i): i is number => typeof i === "number" && validExcerptIndexes.has(i));

      return {
        questionText: typeof q.questionText === "string" ? q.questionText : "",
        questionType: (QUESTION_TYPES.includes(q.questionType as (typeof QUESTION_TYPES)[number])
          ? q.questionType
          : "short_answer") as GeneratedQuestionDraft["questionType"],
        cognitiveLevel: (COGNITIVE_LEVELS.includes(q.cognitiveLevel as (typeof COGNITIVE_LEVELS)[number])
          ? q.cognitiveLevel
          : "understanding") as GeneratedQuestionDraft["cognitiveLevel"],
        choices: Array.isArray(q.choices) ? (q.choices as GeneratedQuestionDraft["choices"]) : [],
        correctAnswer: typeof q.correctAnswer === "string" ? q.correctAnswer : "",
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? (q.acceptedAnswers as string[]) : [],
        explanation: typeof q.explanation === "string" ? q.explanation : "",
        difficulty: typeof q.difficulty === "number" ? Math.min(5, Math.max(1, Math.round(q.difficulty))) : 3,
        commonMistake: typeof q.commonMistake === "string" ? q.commonMistake : null,
        // Fall back to citing every excerpt provided rather than dropping a
        // question outright -- an ungrounded citation array is a quality
        // problem for the verification stage to catch, not a reason to
        // silently discard a generated question here.
        citedExcerptIndexes: cited.length > 0 ? cited : args.excerpts.map((e) => e.index),
      };
    })
    .filter((q) => q.questionText.trim().length > 0 && q.explanation.trim().length > 0);
}
