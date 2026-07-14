const { chromium } = require("playwright");
const SHOT_DIR = "C:/Users/anike/AppData/Local/Temp/claude/c--Users-anike-OneDrive-Desktop-studyclash/e1cfb4ed-004b-4763-93c5-82dab6d55b68/scratchpad";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[console] ${m.text()}`); });

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.locator("#battle-ai").scrollIntoViewIfNeeded();

  // Switch to adaptive difficulty explicitly (it's the default "Battle Now"
  // path already, but click through the picker to be sure).
  await page.click('#battle-ai button:has-text("Battle Now")');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOT_DIR}/irt-1-started.png` });

  // Answer 3 rounds, always picking the FIRST choice, and log theta/prob
  // after each round to see the model actually move.
  for (let round = 0; round < 3; round++) {
    const choiceButtons = await page.locator("#battle-ai .grid.gap-2 button").all();
    if (choiceButtons.length === 0) break;
    await choiceButtons[0].click();
    await page.waitForTimeout(2500); // wait past the AI's simulated think time
    const text = await page.locator("#battle-ai").innerText();
    const thetaMatch = text.match(/Ability \(θ\): ([\-\d.]+)/);
    const probMatch = text.match(/P\(next correct\): (\d+)%/);
    console.log(`Round ${round + 1}: theta=${thetaMatch?.[1]} predictedNext=${probMatch?.[1]}%`);
    await page.screenshot({ path: `${SHOT_DIR}/irt-2-round${round + 1}.png` });
    const nextBtn = page.locator("#battle-ai button:has-text('Next')");
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForTimeout(400);
    }
  }

  console.log("ERRORS:", JSON.stringify(errors, null, 2));
  await browser.close();
})();
