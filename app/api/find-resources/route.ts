import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  checkInMemoryRateLimit,
  getBearerToken,
  getClientIpAddress,
  getServiceSupabaseClient,
  hashIdentifier,
} from "@/lib/server/apiUtils";
import { tavilySearch, type TavilySearchResult } from "@/lib/server/tavily";

// Real-time, grounded study-resource discovery. Unlike generate-questions
// and vyra-chat (which only ever draw on the model's own knowledge), this
// route retrieves live search results first and the model is only allowed
// to select from what was actually returned -- every URL in the response is
// re-checked against the raw search results before being sent to the
// client, so the model cannot hallucinate a resource that doesn't exist.

const AUTH_DAILY_LIMIT = 25;
const AUTH_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const UNAUTH_BURST_LIMIT = 4;
const UNAUTH_BURST_WINDOW_MS = 60_000;
const UNAUTH_DAILY_LIMIT = 12;
const UNAUTH_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_RESOURCES_RETURNED = 5;

type ExamTrack = "lsat" | "mcat" | "nclex" | "ap";

type FindResourcesPayload = {
  topic?: string;
  courseName?: string;
  examTrack?: ExamTrack;
  weakTopics?: string[];
};

type ResourceRecommendation = {
  title: string;
  source: string;
  url: string;
  whyChosen: string;
  estimatedStudyTime: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "mixed";
  resourceType: string;
  trustTier: "official" | "reputable" | "community";
};

// Domains known to be official/authoritative for a given exam track, passed
// to the model as a *hint* for ranking -- not a hard search filter, since a
// hard include_domains restriction would return zero results for subjects
// those sites don't happen to cover.
const TRUSTED_DOMAIN_HINTS: Record<ExamTrack, string> = {
  lsat: "lsac.org (official LSAT administrator), khanacademy.org",
  mcat: "aamc.org (official MCAT administrator), khanacademy.org, ncbi.nlm.nih.gov",
  nclex: "ncsbn.org (official NCLEX administrator/exam board)",
  ap: "apstudents.collegeboard.org (official AP program), khanacademy.org",
};
const GENERAL_TRUSTED_HINTS =
  ".gov and .edu domains, khanacademy.org, openstax.org, and official university or government curriculum pages";

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildSearchQuery(payload: FindResourcesPayload): string {
  const focus =
    (payload.topic && payload.topic.trim()) ||
    (payload.weakTopics && payload.weakTopics.length > 0 ? payload.weakTopics.slice(0, 2).join(" and ") : "");

  const parts = [focus || "core concepts"];
  if (payload.courseName) parts.push(`for ${payload.courseName}`);
  parts.push("study guide OR official curriculum OR practice questions");

  return parts.join(" ").trim();
}

function buildRankingPrompt(args: {
  query: string;
  payload: FindResourcesPayload;
  results: TavilySearchResult[];
}): string {
  const { query, payload, results } = args;

  const trustHint = payload.examTrack
    ? TRUSTED_DOMAIN_HINTS[payload.examTrack]
    : GENERAL_TRUSTED_HINTS;

  const resultsBlock = results
    .map(
      (r, i) =>
        `${i + 1}. Title: ${r.title}\n   URL: ${r.url}\n   Snippet: ${r.content || "(no snippet)"}`
    )
    .join("\n\n");

  return `You are curating study resources for a student. Search query used: "${query}".

Known trustworthy domains for this context (prefer these when present, but only from the list below): ${trustHint}.

Below are REAL, live search results. You may ONLY recommend resources from this exact list -- never invent a title, source, or URL that is not present below. If none of these results are genuinely useful or trustworthy for a student studying this topic, return an empty "resources" array and explain why in "disclaimer".

Search results:
${resultsBlock}

Select at most ${MAX_RESOURCES_RETURNED} of the BEST results (not all of them -- rank and prioritize, do not overwhelm the student). Prioritize official exam boards, government/university education sites, and well-known reputable educational platforms over generic blogs or content-mill sites. For each selected resource, return:
- title: the exact title from the result (you may lightly clean it up, do not change its meaning)
- source: the organization/site name (e.g. "Khan Academy", "College Board"), inferred from the URL/title
- url: the EXACT url string from the result, character for character
- whyChosen: one specific sentence on why this helps the student right now
- estimatedStudyTime: a short estimate like "10-15 min" or "30-40 min"
- difficulty: one of "beginner", "intermediate", "advanced", "mixed"
- resourceType: one of "official_curriculum", "past_paper", "video", "study_guide", "practice_questions", "documentation", "interactive", "article"
- trustTier: "official" if it's an exam board/government/university source, "reputable" if it's a well-known educational platform, "community" for anything else (forums, personal blogs, etc.)

Return ONLY valid JSON in this exact shape, no markdown, no extra text:
{
  "resources": [
    { "title": "...", "source": "...", "url": "...", "whyChosen": "...", "estimatedStudyTime": "...", "difficulty": "...", "resourceType": "...", "trustTier": "..." }
  ],
  "disclaimer": "optional string, only set if resources is empty or results are limited"
}`;
}

function isValidRecommendation(value: unknown): value is ResourceRecommendation {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.title === "string" &&
    typeof c.source === "string" &&
    typeof c.url === "string" &&
    typeof c.whyChosen === "string" &&
    typeof c.estimatedStudyTime === "string" &&
    typeof c.difficulty === "string" &&
    typeof c.resourceType === "string" &&
    typeof c.trustTier === "string"
  );
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    let authedUserId: string | null = null;

    if (token) {
      const supabase = getServiceSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      authedUserId = user?.id || null;
    }

    const ipHash = hashIdentifier(getClientIpAddress(req));

    if (authedUserId) {
      const dailyLimit = checkInMemoryRateLimit({
        key: `find-resources-daily:${authedUserId}`,
        limit: AUTH_DAILY_LIMIT,
        windowMs: AUTH_DAILY_WINDOW_MS,
      });

      if (!dailyLimit.allowed) {
        return NextResponse.json(
          { error: "Daily resource-search limit reached. Try again tomorrow." },
          { status: 429, headers: { "Retry-After": String(dailyLimit.retryAfterSeconds) } }
        );
      }
    } else {
      const burst = checkInMemoryRateLimit({
        key: `find-resources-burst:${ipHash}`,
        limit: UNAUTH_BURST_LIMIT,
        windowMs: UNAUTH_BURST_WINDOW_MS,
      });

      if (!burst.allowed) {
        return NextResponse.json(
          { error: "Too many resource searches. Please wait a moment." },
          { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } }
        );
      }

      const daily = checkInMemoryRateLimit({
        key: `find-resources-daily:${ipHash}`,
        limit: UNAUTH_DAILY_LIMIT,
        windowMs: UNAUTH_DAILY_WINDOW_MS,
      });

      if (!daily.allowed) {
        return NextResponse.json(
          { error: "Daily resource-search limit reached for guest usage. Sign in for a higher limit." },
          { status: 429, headers: { "Retry-After": String(daily.retryAfterSeconds) } }
        );
      }
    }

    const body = (await req.json()) as FindResourcesPayload;
    const payload: FindResourcesPayload = {
      topic: typeof body.topic === "string" ? body.topic.trim().slice(0, 200) : undefined,
      courseName: typeof body.courseName === "string" ? body.courseName.trim().slice(0, 120) : undefined,
      examTrack:
        typeof body.examTrack === "string" && body.examTrack in TRUSTED_DOMAIN_HINTS
          ? (body.examTrack as ExamTrack)
          : undefined,
      weakTopics: Array.isArray(body.weakTopics)
        ? body.weakTopics.filter((t): t is string => typeof t === "string").slice(0, 5)
        : undefined,
    };

    if (!payload.topic && (!payload.weakTopics || payload.weakTopics.length === 0)) {
      return NextResponse.json(
        { error: "Tell VYRA a topic or subject to find resources for." },
        { status: 400 }
      );
    }

    const query = buildSearchQuery(payload);
    const searchResult = await tavilySearch({ query, maxResults: 8 });

    if ("error" in searchResult) {
      return NextResponse.json({ error: searchResult.error }, { status: 503 });
    }

    if (searchResult.results.length === 0) {
      return NextResponse.json({
        resources: [],
        query,
        disclaimer: "No resources were found for this topic right now. Try a more specific or differently-worded topic.",
      });
    }

    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: "Resource ranking is not configured right now." }, { status: 503 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: buildRankingPrompt({ query, payload, results: searchResult.results }) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 1400,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json({ error: "Could not rank resources right now." }, { status: 500 });
    }

    let parsed: { resources?: unknown; disclaimer?: unknown };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return NextResponse.json({ error: "Could not parse ranked resources." }, { status: 500 });
    }

    const candidateResources = Array.isArray(parsed.resources) ? parsed.resources : [];
    const validUrls = new Set(searchResult.results.map((r) => r.url));

    // Hard grounding check: even though the prompt forbids it, never trust
    // the model's own claim that a URL is real -- only keep resources whose
    // URL exactly matches one of the URLs Tavily actually returned.
    const groundedResources: ResourceRecommendation[] = candidateResources
      .filter(isValidRecommendation)
      .filter((r) => validUrls.has(r.url))
      .slice(0, MAX_RESOURCES_RETURNED);

    const disclaimer =
      typeof parsed.disclaimer === "string" && parsed.disclaimer.trim()
        ? parsed.disclaimer.trim()
        : groundedResources.length === 0
          ? "VYRA could not confidently confirm a high-quality resource for this topic right now."
          : undefined;

    return NextResponse.json({ resources: groundedResources, query, disclaimer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong finding resources.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
