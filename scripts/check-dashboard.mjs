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
  const reportHiddenOnLoad = await page.locator("#report").evaluate((el) => el.hidden);

  // Drill-down: report starts hidden, clicking "All" reveals every group.
  await page.click('#filters .fpill[data-sev="all"]');
  await page.waitForSelector("#report .group:not([hidden])", { timeout: 10000 });
  const cards = await page.locator("#report .card").count();
  const visibleGroups = await page.locator("#report .group:not([hidden])").count();

  console.log("banner:", banner.trim());
  console.log("sysinfo:", sysinfo.trim());
  console.log("report hidden on load:", reportHiddenOnLoad, "| cards after All:", cards, "| visible groups:", visibleGroups);
  console.log("hero stats:", stats, "| filter pills:", pills, "| score:", score.trim());
  console.log("console errors:", consoleErrors.length);
  for (const e of consoleErrors) console.log("  [console] " + e);
  console.log("page errors:", pageErrors.length);
  for (const e of pageErrors) console.log("  [page] " + e);
} finally {
  await browser.close();
}
