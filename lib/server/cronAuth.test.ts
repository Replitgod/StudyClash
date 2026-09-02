import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getInternalJobToken, isAuthorizedCronRequest } from "./apiUtils";

// Who may drive the scheduled jobs and the curriculum pipeline.
//
// This regressed once already and it broke a user-facing feature silently:
// requiring CRON_SECRET and nothing else meant that on a deployment which
// never set it, the app's OWN fire-and-forget kick into
// /api/curriculum/process could not authenticate either, so uploading a
// document stopped producing anything. These pin all four cases.

function req(authorization?: string): NextRequest {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authorization ?? null : null) },
  } as unknown as NextRequest;
}

const OLD = { ...process.env };
beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  delete process.env.CRON_SECRET;
  process.env.VERCEL_ENV = "production";
});
afterEach(() => {
  process.env = { ...OLD };
});

describe("isAuthorizedCronRequest", () => {
  it("accepts Vercel's cron header when CRON_SECRET is configured", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCronRequest(req("Bearer s3cret"))).toBe(true);
  });

  it("refuses a wrong secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCronRequest(req("Bearer nope"))).toBe(false);
    expect(isAuthorizedCronRequest(req())).toBe(false);
  });

  it("accepts the app's own internal job token when CRON_SECRET is absent", () => {
    // This is the case that was broken: no cron secret configured, and the
    // upload pipeline still has to be able to kick itself.
    const token = getInternalJobToken();
    expect(token).toBeTruthy();
    expect(isAuthorizedCronRequest(req(`Bearer ${token}`))).toBe(true);
  });

  it("still refuses an outsider in production with no secret set", () => {
    expect(isAuthorizedCronRequest(req())).toBe(false);
    expect(isAuthorizedCronRequest(req("Bearer guess"))).toBe(false);
  });

  it("derives the internal token from the service-role key, not a constant", () => {
    const expected = createHash("sha256")
      .update("acedecks:internal-job:service-role-key-for-tests")
      .digest("hex");
    expect(getInternalJobToken()).toBe(expected);
    // And it must not BE the key -- it goes in a header.
    expect(getInternalJobToken()).not.toContain("service-role-key-for-tests");
  });
});
