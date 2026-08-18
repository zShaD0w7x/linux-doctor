/**
 * Load the web dashboard in headless Chromium and report any JS console
 * errors, page errors, and rendering problems. Uses playwright-core from a
 * temp install (npm i --no-save playwright-core) with the cached browser.
 *
 * Usage: node scripts/check-dashboard.mjs <url>
 */
import { chromium } from "playwright-core";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/check-dashboard.mjs <url>");
  process.exit(2);
}

const exe =
  process.env.CHROME_PATH ||
  `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`;

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 960, height: 1200 } });

const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(err.message));

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#filters .fpill", { timeout: 30000 });
  await page.waitForTimeout(500);

  const banner = await page.textContent("#banner");
  const stats = await page.locator("#summary .stat").count();
  const pills = await page.locator("#filters .fpill").count();
  const score = await page.textContent("#scorenum");
  const sysinfo = await page.textContent("#sysinfo");
  const allActive = await page.locator('#filters .fpill[data-sev="all"].active').count();
  const reportVisibleOnLoad = await page.locator("#report").evaluate((el) => !el.hidden);

  // Default view is "All": every group visible, High open, the rest collapsed.
  await page.waitForSelector("#report .group:not([hidden])", { timeout: 10000 });
  const cards = await page.locator("#report .card").count();
  const crowRows = await page.locator("#report .crow").count();
  const visibleGroups = await page.locator("#report .group:not([hidden])").count();
  const openGroups = await page.locator("#report .group[open]").count();

  // Severity filter shows the status line; Clear returns to All.
  await page.click('#filters .fpill[data-sev="medium"]');
  await page.waitForSelector("#filterbar:not([hidden])", { timeout: 5000 });
  const filterbarTxt = await page.textContent("#filterbar-txt");
  await page.click("#filterbar-clear");
  const filterbarHiddenAfterClear = await page.locator("#filterbar").evaluate((el) => el.hidden);
  const allActiveAfterClear = await page.locator('#filters .fpill[data-sev="all"].active').count();

  console.log("banner:", banner.trim());
  console.log("sysinfo:", sysinfo.trim());
  console.log("all active on load:", allActive === 1, "| report visible on load:", reportVisibleOnLoad);
  console.log("cards:", cards, "| compact rows:", crowRows, "| visible groups:", visibleGroups, "| open groups:", openGroups);
  console.log("filterbar:", filterbarTxt.trim(), "| hidden after Clear:", filterbarHiddenAfterClear, "| All active:", allActiveAfterClear === 1);
  console.log("hero stats:", stats, "| filter pills:", pills, "| score:", score.trim());
  console.log("console errors:", consoleErrors.length);
  for (const e of consoleErrors) console.log("  [console] " + e);
  console.log("page errors:", pageErrors.length);
  for (const e of pageErrors) console.log("  [page] " + e);
} finally {
  await browser.close();
}
