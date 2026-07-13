// Server-only. Every OpenAI model name used anywhere in StudyClash is
// declared here and nowhere else -- route handlers import TERRA_TASK /
// LUNA_TASK / SOL_TASK instead of hardcoding a model string. This file must
// never be imported from a "use client" component; nothing here is exposed
// to the browser (it only ever runs inside app/api/*/route.ts handlers,
// which Next.js already keeps server-side).
//
// Verified live against this account before wiring in (see chat history):
// - All three gpt-5.6 variants (luna, sol, terra) are Chat Completions API
//   models: `openai.chat.completions.create(...)`, not the Responses API.
// - `temperature` only accepts the default value (1) -- passing 0.2/0.3/0.5
//   like the old gpt-4o-mini calls did returns a 400. Never set it for
//   these models.
// - `max_tokens` is rejected; use `max_completion_tokens` instead.
// - `reasoning_effort` is supported: "none" | "low" | "medium" | "high" |
//   "xhigh" (note: "minimal", used by some other reasoning models, is not a
//   valid value here).
// - `response_format: { type: "json_object" }` and vision (`image_url`
//   content parts) both work on luna and terra.

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type AiTask = {
  model: string;
  reasoning_effort: ReasoningEffort;
};

const AI_MODELS = {
  terra: process.env.OPENAI_MODEL_TERRA || "gpt-5.6-terra",
  luna: process.env.OPENAI_MODEL_LUNA || "gpt-5.6-luna",
  sol: process.env.OPENAI_MODEL_SOL || "gpt-5.6-sol",
} as const;

// Terra: every high-value reasoning task in the app -- question generation,
// question-correctness/grounding checks, open-response grading, VYRA coach
// tutoring, weak-topic reports, mastery analysis, personalized study plans.
export const TERRA_TASK: AiTask = {
  model: AI_MODELS.terra,
  reasoning_effort: (process.env.OPENAI_REASONING_TERRA as ReasoningEffort) || "medium",
};

// Luna: classification/extraction/formatting tasks that don't need deep
// reasoning -- topic labels, deck titles, course/unit/exam/curriculum
// extraction, short summaries, image-to-text transcription, resource
// ranking. Cheaper and faster than Terra by design.
export const LUNA_TASK: AiTask = {
  model: AI_MODELS.luna,
  reasoning_effort: (process.env.OPENAI_REASONING_LUNA as ReasoningEffort) || "low",
};

// Sol: reserved for a task that genuinely needs the highest reasoning
// quality available -- not currently wired to any route. None of
// StudyClash's existing features clear that bar; Terra already covers the
// hardest current tasks. Kept here so a future feature can opt in without
// inventing a new model-selection pattern.
export const SOL_TASK: AiTask = {
  model: AI_MODELS.sol,
  reasoning_effort: (process.env.OPENAI_REASONING_SOL as ReasoningEffort) || "high",
};
