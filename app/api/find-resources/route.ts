import { NextRequest, NextResponse } from "next/server";
import {
  getBearerToken,
  getClientIpAddress,
  getServiceSupabaseClient,
  hashIdentifier,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import {
  findStudyResources,
  isKnownExamTrack,
  type ExamTrack,
  type FindResourcesPayload,
} from "@/lib/server/resourceSearch";

export const runtime = "nodejs";
export const maxDuration = 60;

// Real-time, grounded study-resource discovery. Unlike generate-questions
// and vyra-chat's own model reply (which only ever draw on the model's own
// knowledge), this route -- via lib/server/resourceSearch.ts -- retrieves
// live search results first and the model is only allowed to select from
// what was actually returned; every URL in the response is re-checked
// against the raw search results before being sent to the client, so the
// model cannot hallucinate a resource that doesn't exist.

const AUTH_DAILY_LIMIT = 25;
const AUTH_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const UNAUTH_BURST_LIMIT = 4;
const UNAUTH_BURST_WINDOW_MS = 60_000;
const UNAUTH_DAILY_LIMIT = 12;
const UNAUTH_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

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
      const dailyLimit = await checkDistributedRateLimit({
        key: `find-resources-daily:${authedUserId}`,
        limit: AUTH_DAILY_LIMIT,
        windowSeconds: AUTH_DAILY_WINDOW_MS / 1000,
      });

      if (!dailyLimit.allowed) {
        return NextResponse.json(
          { error: "Daily resource-search limit reached. Try again tomorrow." },
          { status: 429, headers: { "Retry-After": String(dailyLimit.retryAfterSeconds) } }
        );
      }
    } else {
      const burst = await checkDistributedRateLimit({
        key: `find-resources-burst:${ipHash}`,
        limit: UNAUTH_BURST_LIMIT,
        windowSeconds: UNAUTH_BURST_WINDOW_MS / 1000,
      });

      if (!burst.allowed) {
        return NextResponse.json(
          { error: "Too many resource searches. Please wait a moment." },
          { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } }
        );
      }

      const daily = await checkDistributedRateLimit({
        key: `find-resources-daily:${ipHash}`,
        limit: UNAUTH_DAILY_LIMIT,
        windowSeconds: UNAUTH_DAILY_WINDOW_MS / 1000,
      });

      if (!daily.allowed) {
        return NextResponse.json(
          { error: "Daily resource-search limit reached for guest usage. Sign in for a higher limit." },
          { status: 429, headers: { "Retry-After": String(daily.retryAfterSeconds) } }
        );
      }
    }

    const body = (await req.json()) as FindResourcesPayload & { examTrack?: ExamTrack };
    const payload: FindResourcesPayload = {
      topic: typeof body.topic === "string" ? body.topic.trim().slice(0, 200) : undefined,
      courseName: typeof body.courseName === "string" ? body.courseName.trim().slice(0, 120) : undefined,
      examTrack: isKnownExamTrack(body.examTrack) ? body.examTrack : undefined,
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

    const supabase = getServiceSupabaseClient();
    const outcome = await findStudyResources(payload, supabase);

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    return NextResponse.json({
      resources: outcome.resources,
      query: outcome.query,
      disclaimer: outcome.disclaimer,
    });
  } catch (err) {
    console.error("Failed to find resources:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Something went wrong finding resources." }, { status: 500 });
  }
}
