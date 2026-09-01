import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";

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

// Parses the comma-separated ADMIN_EMAILS env var, same convention already
// duplicated in app/api/admin/stats and app/api/admin/enterprise-leads --
// centralized here so new admin routes (diagnostic-questions review/publish)
// don't add a third copy.
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export async function requireAdminUser(
  request: NextRequest
): Promise<{ userId: string | null; email: string | null; errorStatus: number | null; errorMessage: string | null }> {
  const token = getBearerToken(request);
  if (!token) {
    return { userId: null, email: null, errorStatus: 401, errorMessage: "Unauthorized" };
  }

  const supabase = getServiceSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { userId: null, email: null, errorStatus: 401, errorMessage: "Unauthorized" };
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes((user.email || "").toLowerCase())) {
    return {
      userId: null,
      email: null,
      errorStatus: 403,
      errorMessage: "You do not have admin access.",
    };
  }

  return { userId: user.id, email: user.email || null, errorStatus: null, errorMessage: null };
}

// True on a real deployment (Vercel sets VERCEL_ENV; NODE_ENV covers a
// self-hosted `next start`). Used to decide whether a missing shared secret
// may fail open.
export function isProductionDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

// Guards the routes only a scheduler is meant to call.
//
// These used to return true whenever CRON_SECRET was unset, which is
// convenient locally and dangerous in production: with the variable
// forgotten on the project, anyone who guessed the path could drive the
// curriculum pipeline -- an OpenAI-spending loop that re-invokes itself --
// as fast as they liked. It now fails OPEN only outside production, and
// fails CLOSED on a real deployment, so a missing secret costs a broken
// cron job (visible, cheap) instead of an unmetered bill (invisible until
// it is not).
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (!isProductionDeployment()) return true;

    // Failing closed here also stops the app's own fire-and-forget kicks
    // into /api/curriculum/process, which attach this header only when the
    // variable exists. That would be a silent stall (the kick is never
    // awaited), so say so loudly -- a misconfigured deployment should be
    // findable in the logs rather than showing up as "uploads never
    // finish processing".
    console.error(
      "CRON_SECRET is not set on a production deployment. Scheduled jobs and " +
        "the curriculum processing pipeline are refusing every request until it is."
    );
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
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

export function generateOpaqueToken(): string {
  return randomBytes(24).toString("base64url");
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
