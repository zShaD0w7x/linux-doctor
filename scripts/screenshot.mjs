/**
 * Regenerate the README dashboard screenshots (light + dark).
 *
 * Usage:
 *   node bin/doctor.js --web &   # live dashboard with real data
 *   node scripts/screenshot.mjs [url]
 *
 * Writes docs/screenshots/dashboard-light.png + dashboard-dark.png.
 * Uses the cached Chromium, no download (playwright-core must resolve).
 * Override the browser with CHROME_PATH=/path/to/chrome if needed.
 */
import { chromium } from "playwright-core";

const url = process.argv[2] || "http://127.0.0.1:43901/";

const exe =
  process.env.CHROME_PATH ||
  `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`;

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
try {
  for (const scheme of ["dark", "light"]) {
    // Viewport framing (not full-page): the README shows hero + the start
    // of the findings — the money shot — at identical sizes in both themes.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1250 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("#report .card", { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `docs/screenshots/dashboard-${scheme}.png` });
    console.log(`Saved docs/screenshots/dashboard-${scheme}.png`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
