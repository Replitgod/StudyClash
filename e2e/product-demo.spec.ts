import { test, expect } from "@playwright/test";

// The homepage product demo is the page's main argument -- it is the only
// place a visitor sees the actual product before signing up -- so it gets its
// own coverage rather than riding on a "page loads" smoke test.

test.describe("homepage product demo", () => {
  test("plays through to the built output and shows all four tabs", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#demo");

    // The reading sequence is time-based; the tabs are the finished state.
    const guideTab = page.getByRole("tab", { name: "Study guide" });
    await expect(guideTab).toBeVisible();

    for (const name of ["Study guide", "Flashcards", "Practice", "Progress"]) {
      await expect(page.getByRole("tab", { name })).toBeVisible();
    }

    // Clicking a tab must skip the intro rather than being ignored while it
    // runs -- a demo that swallows clicks reads as broken.
    await page.getByRole("tab", { name: "Study guide" }).click();
    await expect(
      page.getByText("Le Châtelier's principle").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("a wrong answer explains the misconception rather than saying 'wrong'", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#demo");

    await page.getByRole("tab", { name: "Practice" }).click();
    await page
      .getByRole("button", { name: /It shifts right, making more product/ })
      .click();

    // The whole point of the practice loop: never a bare "Wrong."
    await expect(page.getByText(/^Almost\./)).toBeVisible();
    await expect(page.getByText(/Equilibrium always pushes back/)).toBeVisible();
    await expect(page.getByText(/^Wrong\.?$/)).toHaveCount(0);
  });

  test("the flashcard flips", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#demo");

    await page.getByRole("tab", { name: "Flashcards" }).click();
    const card = page.getByRole("button", { name: /Reveal the answer/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(
      page.getByText(/It shifts left, toward the reactants/)
    ).toBeVisible();
  });

  test("starts finished under reduced motion, so nothing is hidden behind an animation", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/#demo");

    // No waiting: the output must already be there.
    await expect(
      page.getByText("Le Châtelier's principle").first()
    ).toBeVisible({ timeout: 5_000 });
    await context.close();
  });
});
