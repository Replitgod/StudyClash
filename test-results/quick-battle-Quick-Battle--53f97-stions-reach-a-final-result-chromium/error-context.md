# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quick-battle.spec.ts >> Quick Battle: start, answer all 5 questions, reach a final result
- Location: e2e\quick-battle.spec.ts:8:5

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator: getByRole('region', { name: 'Try a live round' }).getByRole('button').filter({ hasNotText: /^(🔊|🔇|Next|Finish|Battle Now|Preparing questions\.\.\.|Hide difficulty options|Choose difficulty instead)$/ }).first()
Expected: enabled
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeEnabled" with timeout 30000ms
  - waiting for getByRole('region', { name: 'Try a live round' }).getByRole('button').filter({ hasNotText: /^(🔊|🔇|Next|Finish|Battle Now|Preparing questions\.\.\.|Hide difficulty options|Choose difficulty instead)$/ }).first()

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
- banner:
  - paragraph: Competitive studying, powered by AI
  - heading "Turn your notes into a study battle." [level=1]
  - paragraph: Upload your material, compete against AI or friends, and rematch the topics you miss.
  - link "Try an Instant Battle":
    - /url: "#battle-ai"
  - link "Upload Notes":
    - /url: /create
  - paragraph: Try the demo without signing up. Create an account when you want to upload and save your own material.
  - region "Autoplay product demo":
    - paragraph: Product preview
    - text: Victory
    - paragraph: Instant result with streak feedback
    - paragraph: Clear winner with next-step actions
    - text: 🏆 You 4 · AI 3 You 4 • AI 3
- region "Try a live round":
  - heading "See StudyClash in action" [level=2]
  - paragraph: "Quick Battle: pick a difficulty and answer 5 questions against the AI. No signup required."
  - paragraph: Quick Battle
  - heading "Battle an AI in One Click" [level=2]
  - paragraph: No lobby. Tap start and answer 5 quick questions.
  - text: No Signup Needed ~60 Seconds
  - button "🔊" [pressed]
  - paragraph: Ready when you are
  - paragraph: Quick Play auto-balances to your pace.
  - button "Preparing questions..." [disabled]
  - button "Choose difficulty instead"
  - paragraph: Mode
  - paragraph: Not started
  - paragraph: You
  - paragraph: "0"
  - paragraph: AI
  - paragraph: "0"
  - paragraph: Round
  - paragraph: 0/5
  - paragraph: Your Accuracy
  - paragraph: "-"
  - paragraph: AI Accuracy
  - paragraph: "-"
  - paragraph: Your Avg Time
  - paragraph: "-"
  - paragraph: AI Avg Time
  - paragraph: "-"
  - text: Tap Battle Now to launch an instant duel.
  - paragraph:
    - text: Want the full picture? Try the
    - link "Guided Product Demo":
      - /url: /demo/battle
    - text: "for the complete loop: upload, battle, mistakes, and a weak-topic rematch."
- region "From notes to mastery":
  - heading "From notes to mastery" [level=2]
  - img
  - heading "Upload your material" [level=3]
  - paragraph: Add notes, a PDF, or a study topic.
  - img
  - heading "Battle to practice" [level=3]
  - paragraph: Compete against AI or challenge a friend.
  - img
  - heading "Rematch your weaknesses" [level=3]
  - paragraph: Study the topics you missed until you master them.
- region "Core benefits":
  - img
  - text: AI-generated questions from your material
  - img
  - text: Instant AI and friend battles
  - img
  - text: Weak-topic detection
  - img
  - text: Targeted rematches
  - img
  - text: Clear explanations
  - img
  - text: Progress tracking
- region "What makes StudyClash different":
  - heading "What makes StudyClash different" [level=2]
  - text: Live AI battles Timed scoring Weak-topic detection Targeted rematches Friend challenge links Questions generated from your own material
- region "Pricing preview":
  - heading "Start free, scale when you need more" [level=2]
  - link "View all plans":
    - /url: /pricing
  - heading "Free" [level=3]
  - paragraph: $0
  - paragraph: Everyone starts here
  - link "Start Free":
    - /url: /pricing
  - text: Most Popular
  - heading "StudyClash Pro" [level=3]
  - paragraph: $3/mo
  - paragraph: For students who want the full loop
  - link "Go Pro":
    - /url: /pricing
- region "Frequently asked questions":
  - heading "FAQ" [level=2]
  - group:
    - text: What is StudyClash?
    - img
  - group:
    - text: How is this different from Quizlet or Knowt?
    - img
  - group:
    - text: Can I battle instantly without creating a room?
    - img
  - group:
    - text: Is there a free plan?
    - img
- region "Get started":
  - heading "Ready to make studying competitive?" [level=2]
  - link "Try an Instant Battle":
    - /url: "#battle-ai"
  - link "Create Your First Deck":
    - /url: /create
- contentinfo:
  - paragraph: StudyClash · Competitive studying for the AI era
  - navigation "Footer links":
    - link "Create":
      - /url: /create
    - link "Guided Demo":
      - /url: /demo/battle
    - link "Pricing":
      - /url: /pricing
    - link "Exams":
      - /url: /exams
    - link "Classroom (Beta)":
      - /url: /classroom
    - link "Contact":
      - /url: /contact
    - link "Privacy":
      - /url: /privacy
    - link "Terms":
      - /url: /terms
- button "Toggle VYRA AI coach":
  - img
  - text: VYRA
- complementary:
  - img
  - paragraph: VYRA AI Coach
  - paragraph: Personal study assistant
  - button "Send feedback or report a problem":
    - img
  - button "Close"
  - paragraph: Website · explain
  - button "Explain"
  - button "Hint"
  - button "Quiz"
  - button "Mistake"
  - button "Plan"
  - button "Rematch"
  - button "Explain this easier"
  - button "Quiz me"
  - button "Give me a hint"
  - button "Why was I wrong?"
  - button "Make a study plan"
  - button "Create weak-topic rematch"
  - button "What should I study next?"
  - button "Find Study Resources":
    - img
    - text: Find Study Resources
  - button "My Blindspots":
    - img
    - text: My Blindspots
  - text: Play a battle first, and I'll analyze your weak topics. You can also ask me about a topic directly.
  - paragraph: "Tip: complete one battle for fully personalized coaching context."
  - textbox "Choose a deck, topic, or missed question to begin..."
  - button "Send" [disabled]
- alert
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