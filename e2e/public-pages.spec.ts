import { test, expect } from "@playwright/test";

// Pure page-load smoke tests -- no AI/Supabase dependency, so these should
// be reliable regardless of external API availability. Covers the public
// pages named in the audit's "no page may remain stuck indefinitely" and
// "no dead buttons/broken links" requirements at a basic level.

test.describe("public pages load without console errors", () => {
  const pages = [
    { path: "/", heading: "Turn your notes into a study battle" },
    { path: "/pricing", heading: "Membership Plans" },
    { path: "/exams", heading: /AI-generated practice/i },
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
