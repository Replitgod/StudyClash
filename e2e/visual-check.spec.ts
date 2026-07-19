import { test, expect } from "@playwright/test";

test("homepage hero: reduced motion has no horizontal overflow and hero renders", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Know exactly what to study next." })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow, "no horizontal overflow under reduced motion at 1440px").toBe(false);
  await context.close();
});
