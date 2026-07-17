import OpenAI from "openai";
import { TERRA_TASK } from "@/lib/server/aiModels";
import { buildMarketingPrompt, type GeneratedContent } from "./promptBuilders";
import type { GeneratorType } from "./constants";
import type { MarketingCampaign, MarketingDestination, MarketingProductProfile } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isValidGeneratedContent(value: unknown): value is GeneratedContent {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.body !== "string" || !record.body.trim()) return false;
  if (record.title !== null && typeof record.title !== "string") return false;
  if (!Array.isArray(record.hashtags)) return false;
  if (!record.hashtags.every((tag) => typeof tag === "string")) return false;
  if (typeof record.structured !== "object" || record.structured === null) return false;
  return true;
}

export async function generateMarketingDraftContent(args: {
  generatorType: GeneratorType;
  profile: MarketingProductProfile;
  campaign: MarketingCampaign;
  destination: MarketingDestination;
  trackingUrl: string;
  avoidBodies: string[];
  additionalGuidance?: string;
}): Promise<GeneratedContent> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  let prompt = buildMarketingPrompt(args);
  if (args.additionalGuidance) {
    prompt += `\n\nAdditional instruction for this attempt: ${args.additionalGuidance}`;
  }

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: TERRA_TASK.reasoning_effort,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("The AI returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI returned invalid JSON.");
  }

  if (!isValidGeneratedContent(parsed)) {
    throw new Error("The AI response was missing required fields.");
  }

  return parsed;
}
