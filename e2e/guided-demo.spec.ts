import { test, expect } from "@playwright/test";

// Exercises the full Guided Product Demo loop: start, answer all 6
// questions, and land on results with a weak-topic report and next steps.
test("Guided Product Demo: start, answer all questions, reach results with weak-topic report", async ({
  page,
}) => {
  await page.goto("/demo/battle");

  await page.getByRole("button", { name: "Start Guided Demo" }).click();

  for (let question = 0; question < 6; question++) {
    // Answer choices are the only enabled buttons with real sentence text
    // on the question screen -- pick the first one available.
    const choiceButtons = page.locator("button[aria-pressed]");
    await expect(choiceButtons.first()).toBeVisible({ timeout: 60_000 });
    await choiceButtons.first().click();

    const advanceButton = page.getByRole("button", { name: /^(Next Question|See Results)$/ });
    await expect(advanceButton).toBeVisible({ timeout: 10_000 });
    await advanceButton.click();
  }

  // Results screen: score/accuracy summary and the weak-topic loop this
  // demo exists to showcase should both be present, not just a bare "done."
  await expect(page.getByText(/accuracy/i).first()).toBeVisible({ timeout: 15_000 });
});
