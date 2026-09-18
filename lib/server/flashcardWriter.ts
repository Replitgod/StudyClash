// Writing flashcards with the model. The rules for what makes a good card
// live in lib/flashcards.ts; this is only the call.

import type OpenAI from "openai";
import { LUNA_TASK } from "@/lib/server/aiModels";
import { buildAceSystemPrompt } from "@/lib/server/aceIntelligence";
import { buildFlashcardPrompt, checkFlashcardBatch, type FlashcardDraft } from "@/lib/flashcards";

const HEADROOM = { none: 200, low: 800, medium: 2000, high: 5000, xhigh: 10000 } as const;

function clean(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : null;
}

/**
 * Cards for some material, plus (optionally) a subject and a title for it,
 * in one call. Best-effort: returns no cards rather than throwing, because
 * a study set without cards is still a study set.
 */
export async function writeFlashcards(
  openai: OpenAI,
  args: {
    notes: string;
    count: number;
    perTopicCap: number | null;
    gradeLevel?: string;
    topicFocus?: string;
    withLabels?: boolean;
  }
): Promise<{ cards: FlashcardDraft[]; subject: string | null; title: string | null }> {
  try {
    const labelRequest = args.withLabels
      ? `

Also return, in the same JSON object:
- "subject": the school subject this belongs to, in 1-3 words (for example "Biology", "World History", "Algebra 2", "Organic Chemistry").
- "title": a short, specific title for this study set, under 60 characters (for example "Cellular Respiration", "Causes of World War I").`
      : "";

    const completion = await openai.chat.completions.create({
      model: LUNA_TASK.model,
      reasoning_effort: LUNA_TASK.reasoning_effort,
      response_format: { type: "json_object" },
      max_completion_tokens: 900 + args.count * 110 + HEADROOM[LUNA_TASK.reasoning_effort],
      messages: [
        {
          role: "developer",
          content: buildAceSystemPrompt({ capability: "flashcards", knowledgeMode: "source_locked" }),
        },
        {
          role: "user",
          content:
            buildFlashcardPrompt({
              notes: args.notes,
              count: args.count,
              gradeLevel: args.gradeLevel,
              topicFocus: args.topicFocus,
            }) + labelRequest,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { cards: [], subject: null, title: null };
    const parsed = JSON.parse(content) as { cards?: unknown; subject?: unknown; title?: unknown };

    return {
      cards: checkFlashcardBatch(parsed.cards, {
        perTopicCap: args.perTopicCap,
        maxCards: args.count,
      }),
      subject: args.withLabels ? clean(parsed.subject, 40) : null,
      title: args.withLabels ? clean(parsed.title, 80) : null,
    };
  } catch (error) {
    console.error(
      "Writing flashcards failed:",
      error instanceof Error ? error.message : error
    );
    return { cards: [], subject: null, title: null };
  }
}

/**
 * Study material rebuilt from a deck's questions, for decks that have no
 * notes of their own (imports, older sets). Each question becomes a fact:
 * what was asked, what is true, and why.
 */
export function notesFromQuestions(
  questions: Array<{
    question_text: string;
    correct_answer: string;
    explanation: string | null;
    topic: string | null;
  }>
): string {
  return questions
    .map((q) =>
      [
        q.topic ? `Topic: ${q.topic}.` : "",
        `Question: ${q.question_text}`,
        `Answer: ${q.correct_answer}.`,
        q.explanation ? `Why: ${q.explanation}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n\n");
}
