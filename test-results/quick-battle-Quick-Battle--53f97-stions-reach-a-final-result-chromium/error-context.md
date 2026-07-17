# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quick-battle.spec.ts >> Quick Battle: start, answer all 5 questions, reach a final result
- Location: e2e\quick-battle.spec.ts:8:5

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: expect(locator).toBeEnabled() failed

Locator:  getByRole('region', { name: 'Try a live round' }).getByRole('button').filter({ hasNotText: /^(🔊|🔇|Next|Finish|Battle Now|Preparing questions\.\.\.|Hide difficulty options|Choose difficulty instead)$/ }).first()
Expected: enabled
Received: undefined

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | // Exercises the homepage Quick Battle widget end to end. Question
  4  | // generation calls OpenAI (with a local fallback pool on failure per
  5  | // InstantAIBattle.tsx), so this test tolerates either a real AI-generated
  6  | // question or the fallback -- it's asserting the UI flow works, not that
  7  | // the AI call specifically succeeded.
  8  | test("Quick Battle: start, answer all 5 questions, reach a final result", async ({ page }) => {
  9  |   await page.goto("/");
  10 | 
  11 |   const region = page.getByRole("region", { name: "Try a live round" });
  12 |   await region.getByRole("button", { name: "Battle Now" }).click();
  13 | 
  14 |   // Answer choices are full-sentence buttons; excluding the known chrome
  15 |   // buttons (sound toggle, Next, difficulty picker, and Battle Now's own
  16 |   // loading-state label -- "Round 0/5" is a static pre-battle placeholder
  17 |   // that's visible even before a question loads, so it's not a useful
  18 |   // signal here) leaves just the real answer choices.
  19 |   const answerButtons = region.getByRole("button").filter({
  20 |     hasNotText:
  21 |       /^(🔊|🔇|Next|Finish|Battle Now|Preparing questions\.\.\.|Hide difficulty options|Choose difficulty instead)$/,
  22 |   });
  23 | 
  24 |   for (let round = 0; round < 5; round++) {
  25 |     // Question generation can take a few seconds on the first round.
> 26 |     await expect(answerButtons.first()).toBeEnabled({ timeout: 30_000 });
     |                                         ^ Error: expect(locator).toBeEnabled() failed
  27 |     await answerButtons.first().click();
  28 | 
  29 |     // The button reads "Next" for rounds 1-4 and "Finish" on round 5. It
  30 |     // only enables once the simulated AI opponent has also "answered"
  31 |     // (round.aiChoice), which has its own thinking-delay timing.
  32 |     const nextButton = region.getByRole("button", { name: /^(Next|Finish)$/ });
  33 |     await expect(nextButton).toBeEnabled({ timeout: 15_000 });
  34 |     await nextButton.click();
  35 |   }
  36 | 
  37 |   // After the 5th round, the widget should show a conclusive result instead
  38 |   // of hanging on a spinner or a 6th question that shouldn't exist.
  39 |   await expect(
  40 |     region.getByText(/won|lost|draw|final|rematch|play again/i).first()
  41 |   ).toBeVisible({ timeout: 15_000 });
  42 | });
  43 | 
```