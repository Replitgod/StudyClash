import { expect, test } from "@playwright/test";

// /exams and the exam it is most searched for.
//
// The first version of these tests guarded a real bug: SAT was a footnote
// saying "we don't write SAT questions" while /exams/sat had become a real
// page, and "sat" was not in the ExamTrack union at all, so the server
// silently generated AP-style questions for anyone who tried it.
//
// They now guard the bigger one underneath it. Every "Practice X" button on
// this page went to /home?track=X -- the topic composer -- while a real
// validated bank sat behind /diagnostics doing nothing. A student who
// clicked an exam got an empty text box.
//
// These assertions are written to hold whether or not the database is
// reachable from the test environment, because the page reads its cards from
// exam_definitions now. A card either offers real practice or says plainly
// that there is none; what it must never do is offer practice that is not
// practice.

test("no practice button on /exams goes to the topic composer", async ({ page }) => {
  await page.goto("/exams");

  // The regression, stated directly. Any link whose label offers practice
  // must start an attempt, not drop the student on Home with a query string.
  const practiceLinks = page.getByRole("link", { name: /^Practis?e / });
  const count = await practiceLinks.count();

  for (let i = 0; i < count; i += 1) {
    const href = await practiceLinks.nth(i).getAttribute("href");
    expect(href).not.toContain("/home");
  }
});

test("an exam that is ready to practise starts a real attempt", async ({ page }) => {
  await page.goto("/exams");

  const sat = page.getByRole("link", { name: /Practise Digital SAT/i });

  // Skipped rather than failed when the bank is not visible from here: the
  // card is read from the database, and a test environment without one is a
  // missing fixture rather than a broken product.
  if ((await sat.count()) === 0) {
    test.skip(true, "No Digital SAT bank visible from this environment.");
    return;
  }

  await expect(sat).toHaveAttribute("href", "/diagnostics/digital-sat");
});

test("an exam with no bank says so instead of offering practice", async ({ page }) => {
  await page.goto("/exams/lsat");

  // LSAT has no question bank. The page must say that in words rather than
  // rendering a card that implies otherwise.
  await expect(page.getByRole("heading", { name: /No question bank yet/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Practise LSAT/i })).toHaveCount(0);
});

test("/exams/sat is a real page, not a generic fallback", async ({ page }) => {
  await page.goto("/exams/sat");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/SAT/i);
  // The old FALLBACK copy, which this page rendered for any slug at all.
  await expect(page.getByText("Practice questions tuned to your exam's format.")).toHaveCount(0);
});

test("an exam slug that does not exist is a 404, not a generic page", async ({ page }) => {
  const response = await page.goto("/exams/not-a-real-exam");
  expect(response?.status()).toBe(404);
});

test("official board practice is still linked, not replaced", async ({ page }) => {
  await page.goto("/exams");
  const official = page.getByRole("link", { name: /Official full-length practice tests/i });
  await expect(official.first()).toHaveAttribute("href", /satsuite\.collegeboard\.org/);
});

test("the sat track still survives the sign-in bounce", async ({ page }) => {
  // /home?track=sat is still a real feature -- it is how a student practises
  // an SAT topic no bank covers, which is most of them. It is just no longer
  // the only thing /exams offers. Losing the query across the login bounce
  // would land them on a generic Home.
  await page.goto("/home?track=sat");
  await page.waitForURL(/\/login\?redirect=/, { timeout: 15_000 });
  expect(decodeURIComponent(page.url())).toContain("/home?track=sat");
});
