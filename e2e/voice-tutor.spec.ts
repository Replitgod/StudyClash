import { test, expect } from "@playwright/test";

// What can honestly be checked without a microphone and a logged-in student.
//
// The tutoring loop, the state machine, the hint ladder and the review are
// covered by 144 unit tests in lib/voice and lib/server/voice, because they
// were deliberately built as pure modules for exactly that reason. What those
// cannot cover is the boundary: that the new entry point does not open a hole
// in the auth gate, and that the two new API routes refuse a stranger.
//
// Everything requiring real audio is in docs/voice-tutor-qa.md.

test.describe("the voice tutor is behind the auth gate", () => {
  // /vyra?call=1 is a new deep link that opens the call screen immediately.
  // A param that skipped the redirect would be a genuine auth bypass, and it
  // is the sort of thing that is easy to add and impossible to notice.
  const deepLinks = [
    "/vyra?call=1",
    "/vyra?call=1&deckId=11111111-1111-1111-1111-111111111111",
  ];

  for (const path of deepLinks) {
    test(`${path} sends a signed-out visitor to log in`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login/, { timeout: 15_000 });
      expect(page.url()).toContain("/login");
    });
  }

  test("the call screen never renders for a signed-out visitor", async ({ page }) => {
    await page.goto("/vyra?call=1");
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    // No dialog, and crucially no microphone request.
    await expect(page.getByRole("dialog", { name: /voice tutor/i })).toHaveCount(0);
  });
});

test.describe("the voice API refuses a stranger", () => {
  const cases = [
    {
      name: "realtime-session cannot be started without a session",
      url: "/api/vyra/realtime-session",
      body: { sourceType: "deck", sourceId: "11111111-1111-1111-1111-111111111111" },
    },
    {
      name: "a voice session cannot be saved without a session",
      url: "/api/vyra/voice-session",
      body: { sessionId: "11111111-1111-1111-1111-111111111111" },
    },
  ];

  for (const { name, url, body } of cases) {
    test(name, async ({ request }) => {
      const response = await request.post(url, { data: body });
      expect(response.status()).toBe(401);
    });

    test(`${name} — and a forged bearer token does not help`, async ({ request }) => {
      const response = await request.post(url, {
        data: body,
        headers: {
          // A structurally valid but unsigned JWT. The route verifies it
          // against Supabase rather than merely parsing it.
          Authorization:
            "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciJ9.not-a-real-signature",
        },
      });
      expect(response.status()).toBe(401);
    });
  }

  test("session history is not readable without a session", async ({ request }) => {
    const response = await request.get("/api/vyra/voice-session");
    expect(response.status()).toBe(401);
  });

  test("a refusal never leaks provider or internal detail", async ({ request }) => {
    const response = await request.post("/api/vyra/realtime-session", {
      data: { sourceType: "deck", sourceId: "not-a-uuid" },
    });

    const text = await response.text();
    expect(text).not.toMatch(/sk-|openai|supabase|service_role|stack|at Object\./i);
  });
});
