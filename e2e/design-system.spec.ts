import { expect, test } from "@playwright/test";

// globals.css is wrapped in `@layer components`. Unlayered CSS beats every
// layer, so while those rules sat outside one they silently won every
// conflict with a Tailwind utility -- the class in the markup just did
// nothing, with no warning. That had already broken the Library search box
// (the placeholder rendered under the search icon) and three type sizes.
//
// These two tests pin both halves of the contract: a utility wins when one
// is written, and the component class still applies when none is.

test("a utility in the markup beats the component class", async ({ page }) => {
  await page.goto("/contact");
  // app/contact/page.tsx writes `t-body ... text-[17px]`; .t-body is 15px.
  const size = await page
    .locator("p.t-body")
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize);
  expect(size).toBe("17px");
});

test("the component class still applies when nothing overrides it", async ({ page }) => {
  await page.goto("/pricing");
  const heading = page.locator("h1").first();
  await expect(heading).toBeVisible();
  // .btn sets a 2.75rem min-height; nothing on /pricing overrides it.
  const minHeight = await page
    .locator("a.btn, button.btn")
    .first()
    .evaluate((el) => getComputedStyle(el).minHeight);
  expect(parseFloat(minHeight)).toBeGreaterThan(0);
});
