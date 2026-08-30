import { test, expect } from "@playwright/test";

// Regression guard for the catch-all rewrite.
//
// A `"rewrites": [{ "source": "/(.*)", "destination": "/" }]` entry in
// vercel.json served the marketing homepage for every URL on the site: signed-in
// students who clicked "Review what you forgot" or opened a deck landed back on
// the landing page. Next.js App Router does its own routing, so an SPA-style
// catch-all is never correct here -- and it fails only on Vercel, never in
// `next dev`, which is what let it ship.
//
// These assert the opposite of that failure: each route must render ITS OWN
// page, not the landing page. They deliberately check signed-out destinations
// too, because "bounced to the landing page" and "correctly sent to /login"
// look identical to a user and very different to the app.

const LANDING_HEADING = "Give it anything. Learn everything.";

test.describe("routes resolve to their own page, not the homepage", () => {
  // Public routes that must render themselves.
  const distinctPages = [
    { path: "/pricing", heading: /Free to prove it/i },
    { path: "/login", heading: /Log in/i },
    { path: "/signup", heading: /Create your account/i },
    { path: "/contact", heading: /./ },
  ];

  for (const { path, heading } of distinctPages) {
    test(`${path} is not served the landing page`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole("heading", { name: LANDING_HEADING })
      ).toHaveCount(0);
    });
  }

  // App routes reached while signed out must go to /login -- never silently to
  // the landing page, which is what the rewrite did.
  const guarded = ["/home", "/library", "/practice", "/vyra", "/settings"];

  for (const path of guarded) {
    test(`${path} sends a signed-out visitor to log in`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: /Log in/i }).first()).toBeVisible();
    });
  }

  test("a study session URL keeps its query string through the login bounce", async ({
    page,
  }) => {
    // The query string is what makes a session the RIGHT session: without it a
    // student who asked for ten weak-topic questions gets a generic run over
    // the whole deck instead.
    const target = "/study/demo-deck?mode=weak_topic&topics=Ionic%20bonding&limit=10";
    await page.goto(target);
    await page.waitForURL(/\/login\?redirect=/, { timeout: 15_000 });

    const redirect = new URL(page.url()).searchParams.get("redirect");
    expect(redirect).toBe("/study/demo-deck?mode=weak_topic&topics=Ionic%20bonding&limit=10");
  });
});
