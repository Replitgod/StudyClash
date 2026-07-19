import OpenAI from "openai";
import { LUNA_TASK, TERRA_TASK } from "@/lib/server/aiModels";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Section 3: "every summary must preserve" these categories, kept
// structured (not folded into prose) so later stages (Section 5 concept
// mapping, Section 7 question generation) can reuse them directly.
export type SummaryContent = {
  title: string;
  summary: string;
  keyFacts: string[];
  definitions: string[];
  formulas: string[];
  procedures: string[];
  dates: string[];
  vocabulary: string[];
  examples: string[];
  exceptions: string[];
  relationships: string[];
  misconceptions: string[];
  learningObjectives: string[];
};

const EMPTY_SUMMARY_FIELDS: Omit<SummaryContent, "title" | "summary"> = {
  keyFacts: [],
  definitions: [],
  formulas: [],
  procedures: [],
  dates: [],
  vocabulary: [],
  examples: [],
  exceptions: [],
  relationships: [],
  misconceptions: [],
  learningObjectives: [],
};

function isValidSummaryContent(value: unknown): value is SummaryContent {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.summary !== "string") return false;
  for (const key of Object.keys(EMPTY_SUMMARY_FIELDS)) {
    if (!Array.isArray(record[key])) return false;
  }
  return true;
}

function normalizeSummary(raw: Partial<SummaryContent> & { title: string; summary: string }): SummaryContent {
  return { ...EMPTY_SUMMARY_FIELDS, ...raw };
}

const FIELD_INSTRUCTIONS = `
Extract, from ONLY the text given (never add outside knowledge):
- title: a short label for what this content covers.
- summary: 2-4 sentence plain-language summary.
- keyFacts: important standalone facts.
- definitions: "term: definition" pairs actually stated in the text.
- formulas: any formulas/equations present, verbatim.
- procedures: any step-by-step processes described.
- dates: any dates/timeline facts present.
- vocabulary: key terms a student should know (may overlap definitions but focused on terminology, not full definitions).
- examples: worked examples or illustrative cases given.
- exceptions: caveats, exceptions, edge cases mentioned.
- relationships: how concepts here connect to each other (e.g. "X causes Y", "A is a type of B").
- misconceptions: any misconception the text explicitly corrects or warns about (empty array if none stated).
- learningObjectives: what a student should be able to do after learning this (only if implied by the text itself, not invented).
Leave any category as an empty array if the text has nothing for it -- never invent content to fill a category.
`.trim();

export async function summarizeChunksBatch(
  chunks: { id: string; content: string }[]
): Promise<Map<string, SummaryContent>> {
  if (chunks.length === 0) return new Map();

  const prompt = `
You are extracting structured study content from textbook excerpts for AcedIQ's curriculum engine.

${FIELD_INSTRUCTIONS}

Return ONLY valid JSON: {"summaries": [{"chunkId": string, "title": string, "summary": string, "keyFacts": [], "definitions": [], "formulas": [], "procedures": [], "dates": [], "vocabulary": [], "examples": [], "exceptions": [], "relationships": [], "misconceptions": [], "learningObjectives": []}, ...]}
One entry per excerpt below, in the same order, each with its exact chunkId.

${chunks.map((c) => `--- Excerpt (chunkId: ${c.id}) ---\n${c.content}`).join("\n\n")}
`.trim();

  const completion = await openai.chat.completions.create({
    model: LUNA_TASK.model,
    reasoning_effort: LUNA_TASK.reasoning_effort,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Chunk summarization returned an empty response.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Chunk summarization returned invalid JSON.");
  }

  const summariesArray = (parsed as { summaries?: unknown }).summaries;
  if (!Array.isArray(summariesArray)) {
    throw new Error("Chunk summarization response was missing a summaries array.");
  }

  const result = new Map<string, SummaryContent>();
  for (const entry of summariesArray) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const chunkId = typeof record.chunkId === "string" ? record.chunkId : null;
    if (!chunkId || !isValidSummaryContent(record)) continue;
    result.set(chunkId, normalizeSummary(record as SummaryContent));
  }

  return result;
}

// Rolls up N child summaries (chunk -> section, section -> chapter,
// chapter -> course) into one parent summary -- reads only the child
// summaries, never the raw source text again, which is what keeps this
// tractable at "thousands of pages" scale (a course-level rollup reads a
// handful of chapter summaries, not the whole library).
export async function summarizeFromChildren(args: {
  children: SummaryContent[];
  levelLabel: "section" | "chapter" | "course";
  title: string;
}): Promise<SummaryContent> {
  const prompt = `
You are synthesizing a ${args.levelLabel}-level summary for AcedIQ's curriculum engine, from the summaries of its parts (already extracted, don't re-derive from scratch -- merge and deduplicate them).

Title for this ${args.levelLabel}: ${args.title}

${FIELD_INSTRUCTIONS}
Merge overlapping items across the child summaries (don't just concatenate duplicates) and keep the result proportionate to a ${args.levelLabel}-level view, not an exhaustive re-listing of every child fact.

Child summaries:
${args.children
  .map(
    (child, i) =>
      `--- Child ${i + 1}: ${child.title} ---\n${JSON.stringify(child)}`
  )
  .join("\n\n")}

Return ONLY valid JSON: {"title": string, "summary": string, "keyFacts": [], "definitions": [], "formulas": [], "procedures": [], "dates": [], "vocabulary": [], "examples": [], "exceptions": [], "relationships": [], "misconceptions": [], "learningObjectives": []}
`.trim();

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: TERRA_TASK.reasoning_effort,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error(`${args.levelLabel} summarization returned an empty response.`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${args.levelLabel} summarization returned invalid JSON.`);
  }

  if (!isValidSummaryContent(parsed)) {
    throw new Error(`${args.levelLabel} summarization response was missing required fields.`);
  }

  return normalizeSummary(parsed);
}
