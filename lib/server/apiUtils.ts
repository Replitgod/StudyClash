import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let cachedServiceClient: SupabaseClient | null = null;

export function assertServerEnvConfigured(): void {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Server environment is not configured for Supabase.");
  }
}

export function getServiceSupabaseClient(): SupabaseClient {
  assertServerEnvConfigured();

  if (!cachedServiceClient) {
    cachedServiceClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  return cachedServiceClient;
}

export function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

export async function requireAuthenticatedUser(
  request: NextRequest
): Promise<{ userId: string | null; errorResponse: string | null }> {
  const token = getBearerToken(request);
  if (!token) {
    return { userId: null, errorResponse: "Unauthorized" };
  }

  const supabase = getServiceSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { userId: null, errorResponse: "Unauthorized" };
  }

  return { userId: user.id, errorResponse: null };
}

export function getClientIpAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)[0];

  const candidates = [
    firstForwarded,
    request.headers.get("x-real-ip") || "",
    request.headers.get("cf-connecting-ip") || "",
    request.headers.get("x-vercel-forwarded-for") || "",
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  return "unknown";
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

const rateLimitStore = new Map<string, RateLimitBucket>();
let rateLimitChecks = 0;

function cleanupExpiredRateLimitBuckets(now: number) {
  // Cleanup is intentionally lightweight and infrequent.
  if (rateLimitChecks % 200 !== 0) return;

  for (const [key, bucket] of rateLimitStore.entries()) {
    if (now >= bucket.resetAtMs) {
      rateLimitStore.delete(key);
    }
  }
}

export function checkInMemoryRateLimit(args: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  rateLimitChecks += 1;
  cleanupExpiredRateLimitBuckets(now);
  const bucket = rateLimitStore.get(args.key);

  if (!bucket || now >= bucket.resetAtMs) {
    rateLimitStore.set(args.key, {
      count: 1,
      resetAtMs: now + args.windowMs,
    });

    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= args.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000)),
    };
  }

  bucket.count += 1;
  rateLimitStore.set(args.key, bucket);

  return { allowed: true, retryAfterSeconds: 0 };
}
