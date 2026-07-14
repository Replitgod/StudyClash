import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { checkInMemoryRateLimit } from "./apiUtils";

// checkInMemoryRateLimit (apiUtils.ts) keeps its counters in a process-local
// Map. On Vercel, each serverless instance has its own process, and
// instances are recycled/scaled independently, so that counter does not
// reflect true global request volume — a burst can land on several cold
// instances at once and each will think it's the first request. Upstash
// Redis gives every instance a shared, atomic counter instead.
//
// Falls back to the in-memory limiter when Upstash isn't configured, so
// local dev and not-yet-provisioned deployments keep working (with the
// weaker per-instance guarantee) instead of throwing.

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
if (upstashUrl && upstashToken) {
  redis = new Redis({ url: upstashUrl, token: upstashToken });
}

const limiterCache = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowSeconds: number): Ratelimit {
  const cacheKey = `${limit}:${windowSeconds}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: redis as Redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    analytics: false,
    prefix: "studyjoust:ratelimit",
  });

  limiterCache.set(cacheKey, limiter);
  return limiter;
}

export function isDistributedRateLimitConfigured(): boolean {
  return redis !== null;
}

export async function checkDistributedRateLimit(args: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (!redis) {
    return checkInMemoryRateLimit({
      key: args.key,
      limit: args.limit,
      windowMs: args.windowSeconds * 1000,
    });
  }

  const limiter = getLimiter(args.limit, args.windowSeconds);
  const result = await limiter.limit(args.key);

  if (result.success) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { allowed: false, retryAfterSeconds };
}
