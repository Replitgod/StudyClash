import { expect, test } from "@playwright/test";

// SAT was a footnote saying "we don't write SAT questions" while
// /exams/sat had become a real page -- the two contradicted each other, and
// the server silently generated AP-style questions for anyone who tried the
// SAT track because "sat" was not in the ExamTrack union at all.

test("/exams offers SAT practice rather than disclaiming it", async ({ page }) => {
  await page.goto("/exams");
  await expect(page.getByText(/We don.t write SAT questions/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Practice SAT questions/i })).toBeVisible();
});

test("the SAT practice link carries the sat track through to the composer", async ({ page }) => {
  await page.goto("/exams");
  const cta = page.getByRole("link", { name: /Practice SAT questions/i });
  await expect(cta).toHaveAttribute("href", "/home?track=sat");
});

test("/exams/sat is a real page, not the generic fallback", async ({ page }) => {
  await page.goto("/exams/sat");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/SAT/i);
  // FALLBACK's copy, which this page used to render.
  await expect(page.getByText("Practice questions tuned to your exam's format.")).toHaveCount(0);
});

test("official College Board practice is still linked, not replaced", async ({ page }) => {
  await page.goto("/exams");
  const official = page.getByRole("link", { name: /Official full-length practice tests/i });
  await expect(official).toHaveAttribute("href", /satsuite\.collegeboard\.org/);
});

test("the sat track survives the sign-in bounce", async ({ page }) => {
  // The complaint this fixes: every "Practice X" button goes to
  // /home?track=X, the track existed only as a hidden request field, and
  // the destination rendered the ordinary greeting and an empty box -- so
  // the button looked like it had dumped you back on the home screen.
  //
  // Signed out, the first thing that has to survive is the login bounce:
  // losing the query here would land the student on a generic Home even
  // after the rest of the fix.
  await page.goto("/home?track=sat");
  await page.waitForURL(/\/login\?redirect=/, { timeout: 15_000 });
  expect(decodeURIComponent(page.url())).toContain("/home?track=sat");
});
