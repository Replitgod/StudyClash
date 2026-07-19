import OpenAI from "openai";
import { TERRA_TASK } from "@/lib/server/aiModels";
import type { SummaryContent } from "./summarization";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ExtractedConcept = {
  name: string;
  description: string;
  importance: "low" | "medium" | "high" | "critical";
  difficulty: "easy" | "medium" | "hard";
  commonMistakes: string[];
  estimatedLearningMinutes: number;
  // Names of other concepts within this same chapter that must be
  // understood first -- resolved to real concept_id foreign keys by the
  // job handler afterward (an LLM pass can't know real DB ids).
  prerequisiteNames: string[];
  relatedConceptNames: string[];
};

export type ChapterConceptBreakdown = {
  chapterDescription: string;
  chapterImportance: "low" | "medium" | "high" | "critical";
  concepts: ExtractedConcept[];
};

// Concept extraction reads the chapter's ALREADY-EXTRACTED summary
// (Section 3's output), never the raw source text again -- this is what
// keeps concept mapping tractable across a 1,200-page textbook: a handful
// of chapter summaries, not the whole document library, feed this pass.
export async function extractConceptsFromChapterSummary(args: {
  chapterTitle: string;
  summary: SummaryContent;
}): Promise<ChapterConceptBreakdown> {
  const prompt = `
You are building a curriculum knowledge graph for AcedIQ from an already-extracted chapter summary. Break this chapter down into its distinct teachable concepts (roughly topic/skill-sized -- not every single fact, and not just one concept for the whole chapter).

Chapter: ${args.chapterTitle}

Summary data (use ONLY this, never add outside knowledge):
${JSON.stringify(args.summary, null, 2)}

For each concept, provide:
- name: short concept name.
- description: 1-2 sentences.
- importance: "low" | "medium" | "high" | "critical" (how central this is to the chapter).
- difficulty: "easy" | "medium" | "hard".
- commonMistakes: drawn from the summary's misconceptions/exceptions if any apply to this concept, else empty array.
- estimatedLearningMinutes: a reasonable estimate for a student to learn this concept.
- prerequisiteNames: names of OTHER concepts in this same breakdown that should be learned first (empty array if none, or if this is foundational).
- relatedConceptNames: names of other concepts in this same breakdown that connect to this one without being a strict prerequisite.

Also provide:
- chapterDescription: 1-2 sentence description of the chapter as a whole.
- chapterImportance: "low" | "medium" | "high" | "critical".

Return ONLY valid JSON: {"chapterDescription": string, "chapterImportance": string, "concepts": [{"name": string, "description": string, "importance": string, "difficulty": string, "commonMistakes": [], "estimatedLearningMinutes": number, "prerequisiteNames": [], "relatedConceptNames": []}, ...]}
`.trim();

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: TERRA_TASK.reasoning_effort,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Concept extraction returned an empty response.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Concept extraction returned invalid JSON.");
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.concepts)) {
    throw new Error("Concept extraction response was missing a concepts array.");
  }

  return {
    chapterDescription: typeof record.chapterDescription === "string" ? record.chapterDescription : "",
    chapterImportance: (["low", "medium", "high", "critical"].includes(record.chapterImportance as string)
      ? record.chapterImportance
      : "medium") as ChapterConceptBreakdown["chapterImportance"],
    concepts: record.concepts
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((c) => ({
        name: typeof c.name === "string" ? c.name : "Untitled concept",
        description: typeof c.description === "string" ? c.description : "",
        importance: (["low", "medium", "high", "critical"].includes(c.importance as string) ? c.importance : "medium") as ExtractedConcept["importance"],
        difficulty: (["easy", "medium", "hard"].includes(c.difficulty as string) ? c.difficulty : "medium") as ExtractedConcept["difficulty"],
        commonMistakes: Array.isArray(c.commonMistakes) ? (c.commonMistakes as string[]) : [],
        estimatedLearningMinutes: typeof c.estimatedLearningMinutes === "number" ? c.estimatedLearningMinutes : 15,
        prerequisiteNames: Array.isArray(c.prerequisiteNames) ? (c.prerequisiteNames as string[]) : [],
        relatedConceptNames: Array.isArray(c.relatedConceptNames) ? (c.relatedConceptNames as string[]) : [],
      })),
  };
}
