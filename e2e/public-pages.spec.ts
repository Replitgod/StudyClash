import { test, expect } from "@playwright/test";

// Pure page-load smoke tests -- no AI/Supabase dependency, so these should
// be reliable regardless of external API availability. Covers the public
// pages named in the audit's "no page may remain stuck indefinitely" and
// "no dead buttons/broken links" requirements at a basic level.

test.describe("public pages load without console errors", () => {
  const pages = [
    { path: "/", heading: "Give it anything. Learn everything." },
    { path: "/login", heading: /Log in/i },
    { path: "/signup", heading: /Create your account/i },
    { path: "/pricing", heading: /Free to prove it/i },
    { path: "/exams", heading: /Exam practice/i },
    { path: "/diagnostics", heading: /Diagnostics/i },
    { path: "/privacy", heading: /Privacy/i },
    { path: "/classroom", heading: /Live Study Rooms/i },
  ];

  for (const { path, heading } of pages) {
    test(`${path} loads and renders its main heading`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      const response = await page.goto(path);
      expect(response?.status(), `${path} should return a 2xx status`).toBeLessThan(400);

      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Filter out noisy third-party/analytics errors that aren't ours to fix.
      const meaningfulErrors = consoleErrors.filter(
        (text) => !/analytics|extension|favicon/i.test(text)
      );
      expect(meaningfulErrors, `console errors on ${path}: ${meaningfulErrors.join("; ")}`).toEqual(
        []
      );
    });
  }

  test("homepage has no horizontal overflow at 375px width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasOverflow).toBe(false);
  });

  test("navigation links on the homepage all resolve (no dead links)", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.$$eval("footer a[href^='/']", (links) =>
      Array.from(new Set(links.map((a) => a.getAttribute("href")).filter(Boolean)))
    );
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      const response = await page.request.get(href as string);
      expect(response.status(), `${href} should not 404/500`).toBeLessThan(400);
    }
  });
});

// The structured data Google indexes has to say the same thing the page says.
// These drifted once already: app/page.tsx kept its own copy of the FAQ, and
// after tiers landed the visible FAQ described the caps correctly while the
// JSON-LD still promised "free and unlimited -- no daily caps, no locked
// modes". Both now read app/components/marketing/faq.ts.
test("homepage FAQ structured data matches the visible FAQ and the real tiers", async ({
  page,
}) => {
  await page.goto("/");

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faq = blocks
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .find((json) => json?.["@type"] === "FAQPage");

  expect(faq, "the homepage should emit an FAQPage block").toBeTruthy();

  const answers: string[] = faq.mainEntity.map(
    (entry: { acceptedAnswer: { text: string } }) => entry.acceptedAnswer.text
  );
  const joined = answers.join(" ");

  // The retired pre-tiers claim must not come back.
  expect(joined).not.toMatch(/free and unlimited|no daily caps|no locked modes/i);
  // And the real free-plan cap must be stated.
  expect(joined).toContain("3 knowledge maps a month");

  // Every schema answer must actually appear on the page.
  for (const entry of faq.mainEntity) {
    await expect(
      page.getByText(entry.name, { exact: false }).first(),
      `FAQ question "${entry.name}" is in the schema but not on the page`
    ).toBeVisible();
  }
});

// The offer pill in the header is the first price claim a visitor reads.
test("the header does not promise an unlimited free plan", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header).not.toContainText(/unlimited/i);
});
