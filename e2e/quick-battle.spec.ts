import { test, expect } from "@playwright/test";

// Exercises the homepage Quick Battle widget end to end. Question
// generation calls OpenAI (with a local fallback pool on failure per
// InstantAIBattle.tsx), so this test tolerates either a real AI-generated
// question or the fallback -- it's asserting the UI flow works, not that
// the AI call specifically succeeded.
test("Quick Battle: start, answer all 5 questions, reach a final result", async ({ page }) => {
  await page.goto("/");

  const region = page.getByRole("region", { name: "Try a live round" });
  await region.getByRole("button", { name: "Battle Now" }).click();

  // Answer choices are full-sentence buttons; excluding the known chrome
  // buttons (sound toggle, Next, difficulty picker, and Battle Now's own
  // loading-state label -- "Round 0/5" is a static pre-battle placeholder
  // that's visible even before a question loads, so it's not a useful
  // signal here) leaves just the real answer choices.
  const answerButtons = region.getByRole("button").filter({
    hasNotText:
      /^(🔊|🔇|Next|Finish|Battle Now|Preparing questions\.\.\.|Hide difficulty options|Choose difficulty instead)$/,
  });

  for (let round = 0; round < 5; round++) {
    // Question generation can take a few seconds on the first round.
    await expect(answerButtons.first()).toBeEnabled({ timeout: 30_000 });
    await answerButtons.first().click();

    // The button reads "Next" for rounds 1-4 and "Finish" on round 5. It
    // only enables once the simulated AI opponent has also "answered"
    // (round.aiChoice), which has its own thinking-delay timing.
    const nextButton = region.getByRole("button", { name: /^(Next|Finish)$/ });
    await expect(nextButton).toBeEnabled({ timeout: 15_000 });
    await nextButton.click();
  }

  // After the 5th round, the widget should show a conclusive result instead
  // of hanging on a spinner or a 6th question that shouldn't exist.
  await expect(
    region.getByText(/won|lost|draw|final|rematch|play again/i).first()
  ).toBeVisible({ timeout: 15_000 });
});
