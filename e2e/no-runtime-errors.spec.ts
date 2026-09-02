import { expect, test } from "@playwright/test";

// Every public page, loaded for real, asserting that nothing threw and
// nothing 4xx/5xx'd.
//
// A clean build and green unit tests say the code compiles and the pure
// logic is right. They say nothing about whether a page actually renders in
// a browser, which is the thing a person actually experiences -- and is the
// gap that let "most of it does not work" be true while every other check
// was green.

const PAGES = ["/", "/pricing", "/exams", "/exams/sat", "/contact", "/privacy", "/terms",
                "/login", "/signup", "/diagnostics", "/classroom", "/demo/battle"];

for (const path of PAGES) {
  test(`${path} has no console errors or failed requests`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
    page.on("response", (r) => {
      if (r.status() >= 400 && !r.url().includes("favicon")) {
        problems.push(`http ${r.status()}: ${r.url().slice(0, 120)}`);
      }
    });

    await page.goto(path, { waitUntil: "networkidle" });
    expect(problems, `${path}:\n${problems.join("\n")}`).toEqual([]);
  });
}
