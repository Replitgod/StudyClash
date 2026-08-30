import { test, expect } from "@playwright/test";

// No accidental horizontal scrolling, at every width the product brief names.
// Checked per page rather than once on the homepage, because overflow is
// almost always introduced by one wide child (a table, a pre, a fixed-width
// card) on one screen, and a single-page check never sees it.

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];
const PAGES = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/exams",
  "/contact",
  "/privacy",
  "/terms",
  "/classroom",
  "/diagnostics",
];

for (const path of PAGES) {
  test(`${path} has no horizontal overflow at any breakpoint`, async ({ page }) => {
    const failures: string[] = [];

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        if (doc.scrollWidth <= doc.clientWidth + 1) return null;
        // Name the widest offending element so a failure is actionable
        // rather than just "something is too wide".
        let worst: { tag: string; right: number } | null = null;
        for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > doc.clientWidth + 1 && (!worst || r.right > worst.right)) {
            worst = {
              tag: `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`,
              right: Math.round(r.right),
            };
          }
        }
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, worst };
      });

      if (overflow) {
        failures.push(
          `${width}px: scrollWidth ${overflow.scrollWidth} > ${overflow.clientWidth}` +
            (overflow.worst ? ` — widest: ${overflow.worst.tag} (right ${overflow.worst.right})` : "")
        );
      }
    }

    expect(failures, `${path}\n  ${failures.join("\n  ")}`).toEqual([]);
  });
}
