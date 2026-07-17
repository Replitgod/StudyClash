# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-pages.spec.ts >> public pages load without console errors >> navigation links on the homepage all resolve (no dead links)
- Location: e2e\public-pages.spec.ts:50:7

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: apiRequestContext.get: Test timeout of 90000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - navigation "Primary" [ref=e3]:
    - link "S" [ref=e4] [cursor=pointer]:
      - /url: /
    - link "Home" [ref=e5] [cursor=pointer]:
      - /url: /
      - img [ref=e7]
      - generic: Home
    - link "Battle" [ref=e12] [cursor=pointer]:
      - /url: /#battle-ai
      - img [ref=e14]
      - generic: Battle
    - link "Study Plan" [ref=e16] [cursor=pointer]:
      - /url: /study-plans/new
      - img [ref=e18]
      - generic: Study Plan
    - link "Decks" [ref=e21] [cursor=pointer]:
      - /url: /decks
      - img [ref=e23]
      - generic: Decks
    - link "Diagnostics" [ref=e26] [cursor=pointer]:
      - /url: /diagnostics
      - img [ref=e28]
      - generic: Diagnostics
    - button "More" [ref=e33]:
      - img [ref=e35]
      - generic: More
  - generic [ref=e42]:
    - generic [ref=e43]:
      - banner [ref=e44]:
        - generic [ref=e45]:
          - paragraph [ref=e47]: Competitive studying, powered by AI
          - heading "Turn your notes into a study battle." [level=1] [ref=e49]
          - paragraph [ref=e51]: Upload your material, compete against AI or friends, and rematch the topics you miss.
          - generic [ref=e52]:
            - link "Try Quick Battle" [ref=e53] [cursor=pointer]:
              - /url: "#battle-ai"
            - link "Upload Notes" [ref=e54] [cursor=pointer]:
              - /url: /create
          - paragraph [ref=e56]: Try the demo without signing up. Create an account when you want to upload and save your own material.
        - region "Autoplay product demo" [ref=e58]:
          - paragraph [ref=e64]: Product preview
          - generic [ref=e66]:
            - generic [ref=e67]: Upload Notes
            - paragraph [ref=e68]: Drop PDF or paste class notes
            - paragraph [ref=e69]: Drag and drop works on mobile and desktop
            - generic [ref=e71]:
              - generic [ref=e72]: 📄
              - paragraph [ref=e74]: chem-notes-unit4.pdf
              - generic [ref=e77]: Ready
            - generic [ref=e79]: 2 files uploaded
      - region "Try a live round" [ref=e91]:
        - generic [ref=e92]:
          - heading "See StudyClash in action" [level=2] [ref=e93]
          - paragraph [ref=e94]: "Quick Battle: pick a difficulty and answer 5 questions against the AI. No signup required."
        - generic [ref=e96]:
          - generic [ref=e97]:
            - generic [ref=e98]:
              - paragraph [ref=e99]: Quick Battle
              - heading "Battle an AI in One Click" [level=2] [ref=e100]
              - paragraph [ref=e101]: No lobby. Tap start and answer 5 quick questions.
            - generic [ref=e102]:
              - generic [ref=e103]: No Signup Needed
              - generic [ref=e104]: ~60 Seconds
              - button "🔊" [pressed] [ref=e105]
          - generic [ref=e106]:
            - generic [ref=e107]:
              - generic [ref=e108]:
                - generic [ref=e109]: 🤖
                - generic [ref=e110]:
                  - paragraph [ref=e111]: Ready when you are
                  - paragraph [ref=e112]: Quick Play auto-balances to your pace.
              - button "Battle Now" [ref=e113]
            - button "Choose difficulty instead" [ref=e115]
          - generic [ref=e116]:
            - generic [ref=e117]:
              - paragraph [ref=e118]: Mode
              - paragraph [ref=e119]: Not started
            - generic [ref=e120]:
              - paragraph [ref=e121]: You
              - paragraph [ref=e122]: "0"
            - generic [ref=e125]:
              - paragraph [ref=e126]: AI
              - paragraph [ref=e127]: "0"
            - generic [ref=e128]:
              - paragraph [ref=e129]: Round
              - paragraph [ref=e130]: 0/5
            - generic [ref=e131]:
              - paragraph [ref=e132]: Your Accuracy
              - paragraph [ref=e133]: "-"
            - generic [ref=e134]:
              - paragraph [ref=e135]: AI Accuracy
              - paragraph [ref=e136]: "-"
            - generic [ref=e137]:
              - paragraph [ref=e138]: Your Avg Time
              - paragraph [ref=e139]: "-"
            - generic [ref=e140]:
              - paragraph [ref=e141]: AI Avg Time
              - paragraph [ref=e142]: "-"
          - generic [ref=e143]: Tap Battle Now to launch an instant duel.
        - paragraph [ref=e144]:
          - text: Want the full picture? Try the
          - link "Guided Product Demo" [ref=e145] [cursor=pointer]:
            - /url: /demo/battle
          - text: "for the complete loop: upload, battle, mistakes, and a weak-topic rematch."
      - region "From notes to mastery" [ref=e146]:
        - heading "From notes to mastery" [level=2] [ref=e147]
        - generic [ref=e148]:
          - generic [ref=e149]:
            - img [ref=e151]
            - heading "Upload your material" [level=3] [ref=e153]
            - paragraph [ref=e154]: Add notes, a PDF, or a study topic.
          - generic [ref=e155]:
            - img [ref=e157]
            - heading "Battle to practice" [level=3] [ref=e159]
            - paragraph [ref=e160]: Compete against AI or challenge a friend.
          - generic [ref=e161]:
            - img [ref=e163]
            - heading "Rematch your weaknesses" [level=3] [ref=e165]
            - paragraph [ref=e166]: Study the topics you missed until you master them.
      - region "Core benefits" [ref=e167]:
        - generic [ref=e168]:
          - generic [ref=e169]:
            - img [ref=e170]
            - generic [ref=e172]: AI-generated questions from your material
          - generic [ref=e173]:
            - img [ref=e174]
            - generic [ref=e176]: Instant AI and friend battles
          - generic [ref=e177]:
            - img [ref=e178]
            - generic [ref=e180]: Weak-topic detection
          - generic [ref=e181]:
            - img [ref=e182]
            - generic [ref=e184]: Targeted rematches
          - generic [ref=e185]:
            - img [ref=e186]
            - generic [ref=e188]: Clear explanations
          - generic [ref=e189]:
            - img [ref=e190]
            - generic [ref=e192]: Progress tracking
      - region "What makes StudyClash different" [ref=e193]:
        - heading "What makes StudyClash different" [level=2] [ref=e194]
        - generic [ref=e195]:
          - generic [ref=e196]: Live AI battles
          - generic [ref=e197]: Timed scoring
          - generic [ref=e198]: Weak-topic detection
          - generic [ref=e199]: Targeted rematches
          - generic [ref=e200]: Friend challenge links
          - generic [ref=e201]: Questions generated from your own material
      - region "Pricing preview" [ref=e202]:
        - generic [ref=e203]:
          - heading "Start free, scale when you need more" [level=2] [ref=e204]
          - link "View all plans" [ref=e205] [cursor=pointer]:
            - /url: /pricing
        - generic [ref=e206]:
          - generic [ref=e207]:
            - heading "Free" [level=3] [ref=e208]
            - paragraph [ref=e209]: $0
            - paragraph [ref=e210]: Everyone starts here
            - link "Start Free" [ref=e211] [cursor=pointer]:
              - /url: /pricing
          - generic [ref=e212]:
            - generic [ref=e213]: Most Popular
            - heading "Student Pro" [level=3] [ref=e214]
            - paragraph [ref=e215]: $3/mo
            - paragraph [ref=e216]: For students who want the full loop
            - link "Go Pro" [ref=e217] [cursor=pointer]:
              - /url: /pricing
          - generic [ref=e218]:
            - heading "Exam Pro" [level=3] [ref=e219]
            - paragraph [ref=e220]: $5/mo
            - paragraph [ref=e221]: Full diagnostics and long-term tracking
            - link "View Exam Pro" [ref=e222] [cursor=pointer]:
              - /url: /pricing
      - region "Frequently asked questions" [ref=e223]:
        - heading "FAQ" [level=2] [ref=e224]
        - generic [ref=e225]:
          - group [ref=e226]:
            - generic "What is StudyClash?" [ref=e227] [cursor=pointer]:
              - text: What is StudyClash?
              - img [ref=e228]
          - group [ref=e230]:
            - generic "How is this different from Quizlet or Knowt?" [ref=e231] [cursor=pointer]:
              - text: How is this different from Quizlet or Knowt?
              - img [ref=e232]
          - group [ref=e234]:
            - generic "Can I battle instantly without creating a room?" [ref=e235] [cursor=pointer]:
              - text: Can I battle instantly without creating a room?
              - img [ref=e236]
          - group [ref=e238]:
            - generic "Is there a free plan?" [ref=e239] [cursor=pointer]:
              - text: Is there a free plan?
              - img [ref=e240]
      - region "Get started" [ref=e242]:
        - generic [ref=e243]:
          - heading "Ready to make studying competitive?" [level=2] [ref=e244]
          - generic [ref=e245]:
            - link "Try Quick Battle" [ref=e246] [cursor=pointer]:
              - /url: "#battle-ai"
            - link "Create Your First Deck" [ref=e247] [cursor=pointer]:
              - /url: /create
      - contentinfo [ref=e248]:
        - generic [ref=e249]:
          - paragraph [ref=e250]: StudyClash · Competitive studying for the AI era
          - navigation "Footer links" [ref=e251]:
            - link "Create" [ref=e252] [cursor=pointer]:
              - /url: /create
            - link "Guided Demo" [ref=e253] [cursor=pointer]:
              - /url: /demo/battle
            - link "Pricing" [ref=e254] [cursor=pointer]:
              - /url: /pricing
            - link "Exams" [ref=e255] [cursor=pointer]:
              - /url: /exams
            - link "Classroom (Beta)" [ref=e256] [cursor=pointer]:
              - /url: /classroom
            - link "Contact" [ref=e257] [cursor=pointer]:
              - /url: /contact
            - link "Privacy" [ref=e258] [cursor=pointer]:
              - /url: /privacy
            - link "Terms" [ref=e259] [cursor=pointer]:
              - /url: /terms
    - button "Toggle VYRA AI coach" [ref=e260]:
      - img [ref=e262]
      - generic [ref=e269]: VYRA
    - complementary:
      - generic:
        - generic:
          - generic:
            - generic:
              - img
            - generic:
              - paragraph: VYRA AI Coach
              - paragraph: Personal study assistant
          - generic:
            - button "Send feedback or report a problem":
              - img
            - button "Close"
        - paragraph: Website · explain
        - generic:
          - button "Explain"
          - button "Hint"
          - button "Quiz"
          - button "Mistake"
          - button "Plan"
          - button "Rematch"
        - generic:
          - button "Explain this easier"
          - button "Quiz me"
          - button "Give me a hint"
          - button "Why was I wrong?"
          - button "Make a study plan"
          - button "Create weak-topic rematch"
          - button "What should I study next?"
        - generic:
          - button "Find Study Resources":
            - img
            - text: Find Study Resources
          - button "My Blindspots":
            - img
            - text: My Blindspots
        - generic:
          - generic:
            - generic:
              - generic: Play a battle first, and I'll analyze your weak topics. You can also ask me about a topic directly.
        - paragraph: "Tip: complete one battle for fully personalized coaching context."
        - generic:
          - textbox "Choose a deck, topic, or missed question to begin..."
          - button "Send" [disabled]
  - button "Open Next.js Dev Tools" [ref=e275] [cursor=pointer]:
    - img [ref=e276]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | // Pure page-load smoke tests -- no AI/Supabase dependency, so these should
  4  | // be reliable regardless of external API availability. Covers the public
  5  | // pages named in the audit's "no page may remain stuck indefinitely" and
  6  | // "no dead buttons/broken links" requirements at a basic level.
  7  | 
  8  | test.describe("public pages load without console errors", () => {
  9  |   const pages = [
  10 |     { path: "/", heading: "Turn your notes into a study battle" },
  11 |     { path: "/pricing", heading: "Membership Plans" },
  12 |     { path: "/exams", heading: /AI-generated practice/i },
  13 |     { path: "/privacy", heading: /Privacy/i },
  14 |     { path: "/classroom", heading: /Live Study Rooms/i },
  15 |   ];
  16 | 
  17 |   for (const { path, heading } of pages) {
  18 |     test(`${path} loads and renders its main heading`, async ({ page }) => {
  19 |       const consoleErrors: string[] = [];
  20 |       page.on("console", (msg) => {
  21 |         if (msg.type() === "error") consoleErrors.push(msg.text());
  22 |       });
  23 | 
  24 |       const response = await page.goto(path);
  25 |       expect(response?.status(), `${path} should return a 2xx status`).toBeLessThan(400);
  26 | 
  27 |       await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({
  28 |         timeout: 15_000,
  29 |       });
  30 | 
  31 |       // Filter out noisy third-party/analytics errors that aren't ours to fix.
  32 |       const meaningfulErrors = consoleErrors.filter(
  33 |         (text) => !/analytics|extension|favicon/i.test(text)
  34 |       );
  35 |       expect(meaningfulErrors, `console errors on ${path}: ${meaningfulErrors.join("; ")}`).toEqual(
  36 |         []
  37 |       );
  38 |     });
  39 |   }
  40 | 
  41 |   test("homepage has no horizontal overflow at 375px width", async ({ page }) => {
  42 |     await page.setViewportSize({ width: 375, height: 812 });
  43 |     await page.goto("/");
  44 |     const hasOverflow = await page.evaluate(
  45 |       () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  46 |     );
  47 |     expect(hasOverflow).toBe(false);
  48 |   });
  49 | 
  50 |   test("navigation links on the homepage all resolve (no dead links)", async ({ page }) => {
  51 |     await page.goto("/");
  52 |     const hrefs = await page.$$eval("footer a[href^='/']", (links) =>
  53 |       Array.from(new Set(links.map((a) => a.getAttribute("href")).filter(Boolean)))
  54 |     );
  55 |     expect(hrefs.length).toBeGreaterThan(0);
  56 | 
  57 |     for (const href of hrefs) {
> 58 |       const response = await page.request.get(href as string);
     |                                           ^ Error: apiRequestContext.get: Test timeout of 90000ms exceeded.
  59 |       expect(response.status(), `${href} should not 404/500`).toBeLessThan(400);
  60 |     }
  61 |   });
  62 | });
  63 | 
```