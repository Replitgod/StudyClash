import { expect, test } from "@playwright/test";

// Published study sets are the app's only indexable surface, so the things
// worth testing are the ones that decide whether Google and a classmate can
// actually use them.

test("an unknown slug is a 404, not a server error", async ({ page }) => {
  const response = await page.goto("/d/definitely-not-a-real-set-aaa111");
  expect(response?.status()).toBe(404);
});

test("a malformed slug is rejected without reaching the database", async ({ page }) => {
  // isValidShareSlug screens these out on shape first.
  for (const bad of ["/d/Photosynthesis", "/d/under_score", "/d/double--hyphen"]) {
    const response = await page.goto(bad);
    expect(response?.status(), bad).toBe(404);
  }
});

test("a withdrawn set reads as never having existed", async ({ page }) => {
  // A 404 status, and no wording that confirms the set was once real --
  // "this was unshared" would leak that a given slug belongs to someone.
  const response = await page.goto("/d/definitely-not-a-real-set-aaa111");
  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText(/unshared|withdrawn|no longer/i);
});

test("robots allows /d/ while still disallowing the signed-in app", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).not.toMatch(/^Disallow: \/d\//m);
  expect(body).toMatch(/Disallow: \/library/);
  expect(body).toMatch(/Disallow: \/mastery-map/);
});

test("the sitemap still serves its static pages", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("/pricing");
  expect(body).toContain("/exams");
  // The sign-in walls removed earlier must stay out.
  expect(body).not.toContain("/mastery-map");
});
