import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import { loadTopicConcepts } from "@/lib/server/voice/topicConcepts";
import { normalizeTopic } from "@/lib/voice/topics";
import type { EducationLevel } from "@/lib/voice/types";

// A lesson outline for a subject, mid-call.
//
// This exists for exactly one caller: the student said "actually, switch to
// algebra two" and the tutor needs something to teach from before it can say
// another word. Everything about it is shaped by sitting on that critical
// path -- the cheap model, the shared cache, the low timeout.
//
// It is authenticated and rate limited despite returning nothing personal,
// because a cache miss costs a model call. An open endpoint that spends
// money per request is a bill, not a feature.

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * Topic switches per student per hour.
 *
 * Generous, because switching subject is the behaviour this feature exists
 * to allow and a student bouncing between four topics in one call is using
 * it correctly. Most of these are cache hits and cost nothing; the limit is
 * here for the pathological case, not the enthusiastic one.
 */
const SWITCHES_PER_HOUR = 40;

const LEVELS: EducationLevel[] = [
  "unspecified",
  "elementary",
  "middle",
  "high_school",
  "ap_honors",
  "undergraduate",
  "graduate",
  "professional",
];

export async function POST(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "I cannot pick up a new topic just now." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));

  // Normalised server-side. It is interpolated into a prompt and used as a
  // cache key shared with other students, so the raw client string is never
  // either of those things.
  const topic = normalizeTopic(body?.topic);
  if (!topic) {
    return NextResponse.json(
      { error: "I could not tell what subject you meant. Say it again?" },
      { status: 400 }
    );
  }

  const level: EducationLevel = LEVELS.includes(body?.level as EducationLevel)
    ? (body.level as EducationLevel)
    : "unspecified";

  const rateLimit = await checkDistributedRateLimit({
    key: `vyra-topic:${userId}`,
    limit: SWITCHES_PER_HOUR,
    windowSeconds: 3600,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "That is a lot of subjects in one hour. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const result = await loadTopicConcepts({
    supabase: getServiceSupabaseClient(),
    topic,
    level,
  });

  if (!result.ok) {
    // 422, not 500: the request was well-formed and the answer is "not
    // that topic". The message is written to be spoken aloud, because the
    // tutor is about to say it.
    return NextResponse.json({ error: result.refusal }, { status: 422 });
  }

  return NextResponse.json({
    topic: result.label,
    concepts: result.concepts,
    cached: result.cached,
  });
}
