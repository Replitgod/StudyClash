# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: guided-demo.spec.ts >> Guided Product Demo: start, answer all questions, reach results with weak-topic report
- Location: e2e\guided-demo.spec.ts:5:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button[aria-pressed]').first()
Expected: visible
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for locator('button[aria-pressed]').first()

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- navigation "Primary":
  - link "S":
    - /url: /
  - link "Home":
    - /url: /
    - img
    - text: Home
  - link "Battle":
    - /url: /#battle-ai
    - img
    - text: Battle
  - link "Study Plan":
    - /url: /study-plans/new
    - img
    - text: Study Plan
  - link "Decks":
    - /url: /decks
    - img
    - text: Decks
  - link "Diagnostics":
    - /url: /diagnostics
    - img
    - text: Diagnostics
  - button "More":
    - img
    - text: More
  - link "Login":
    - /url: /login
    - img
    - text: Login
  - link "Sign Up":
    - /url: /signup
    - img
    - text: Sign Up
- main:
  - text: Guided Product Demo
  - heading "Try the StudyClash flow in 60 seconds." [level=1]
  - paragraph: "This Algebra Skills Battle shows the full StudyClash loop: answer questions, see your score, review weak topics, and jump straight into topic-specific study links. Inspired by common high-school algebra skills — not an official SAT practice test."
  - paragraph: No account needed. Tap Start Guided Demo and answer 6 questions to see the full loop.
  - paragraph: 1. Start instantly
  - paragraph: No upload, no deck setup, no login required.
  - paragraph: 2. Answer 6 questions
  - paragraph: A fresh, randomized algebra question set every run.
  - paragraph: 3. Review what matters
  - paragraph: Weak-topic report, study links, and a 3-day plan.
  - button "Generating fresh questions..." [disabled]
  - link "Create Your Own Deck":
    - /url: /create
- alert
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | // Exercises the full Guided Product Demo loop: start, answer all 6
  4  | // questions, and land on results with a weak-topic report and next steps.
  5  | test("Guided Product Demo: start, answer all questions, reach results with weak-topic report", async ({
  6  |   page,
  7  | }) => {
  8  |   await page.goto("/demo/battle");
  9  | 
  10 |   await page.getByRole("button", { name: "Start Guided Demo" }).click();
  11 | 
  12 |   for (let question = 0; question < 6; question++) {
  13 |     // Answer choices are the only enabled buttons with real sentence text
  14 |     // on the question screen -- pick the first one available.
  15 |     const choiceButtons = page.locator("button[aria-pressed]");
> 16 |     await expect(choiceButtons.first()).toBeVisible({ timeout: 60_000 });
     |                                         ^ Error: expect(locator).toBeVisible() failed
  17 |     await choiceButtons.first().click();
  18 | 
  19 |     const advanceButton = page.getByRole("button", { name: /^(Next Question|See Results)$/ });
  20 |     await expect(advanceButton).toBeVisible({ timeout: 10_000 });
  21 |     await advanceButton.click();
  22 |   }
  23 | 
  24 |   // Results screen: score/accuracy summary and the weak-topic loop this
  25 |   // demo exists to showcase should both be present, not just a bare "done."
  26 |   await expect(page.getByText(/accuracy/i).first()).toBeVisible({ timeout: 15_000 });
  27 | });
  28 | 
```