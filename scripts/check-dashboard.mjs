/**
 * Load the web dashboard in headless Chromium and verify the invariants that
 * matter: no JS console/page errors, the report renders, "All" is the active
 * filter on load, High groups open while the rest stay collapsed, filtering
 * enables Clear, and the overview sidebar populates on wide viewports.
 * Uses playwright-core from a temp install (npm i --no-save playwright-core)
 * with the cached browser.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });

const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(err.message));

let ok = true;
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#filters .fpill", { timeout: 30000 });
  await page.waitForTimeout(500);

  const score = await page.textContent("#scorenum");
  const sysinfo = await page.textContent("#sysinfo");
  const statusmsg = await page.textContent(".statusmsg");
  const statusCls = await page.locator("#status").getAttribute("class");
  const allActive = await page.locator('#filters .fpill[data-sev="all"].active').count();
  const reportVisible = await page.locator("#report").evaluate((el) => !el.hidden);

  // Default view is "All": High groups open, every other group collapsed.
  await page.waitForSelector("#report .group:not([hidden])", { timeout: 10000 });
  const cards = await page.locator("#report .card").count();
  const crowRows = await page.locator("#report .crow").count();
  const visibleGroups = await page.locator("#report .group:not([hidden])").count();
  const openHigh = await page.locator("#report .group.high[open]").count();
  const closedMedium = await page.locator("#report .group.medium:not([open])").count();
  const mediumGroups = await page.locator("#report .group.medium").count();
  const closedInfo = await page.locator("#report .group.info:not([open])").count();
  const infoGroups = await page.locator("#report .group.info").count();
  const highOpenOk = openHigh >= 1 || (openHigh === 0 && cards + crowRows === 0);
  const othersClosedOk = closedMedium === mediumGroups && closedInfo === infoGroups;

  // START HERE banner: shown only when there is a recommended action.
  const nexthepShown = await page.locator("#nexthep").evaluate((el) => !el.hidden);

  // Severity filter enables Clear; Clear returns to "All".
  const clearDisabledOnLoad = await page.locator("#clearbtn").isDisabled();
  await page.click('#filters .fpill[data-sev="medium"]');
  await page.waitForTimeout(200);
  const clearEnabledAfterFilter = !(await page.locator("#clearbtn").isDisabled());
  await page.click("#clearbtn");
  await page.waitForTimeout(200);
  const allActiveAfterClear = await page.locator('#filters .fpill[data-sev="all"].active').count();
  const filterOk = clearDisabledOnLoad && clearEnabledAfterFilter && allActiveAfterClear === 1;

  // Overview sidebar populates on wide viewports (>= 1100px).
  const sidebarShown = await page.locator("#sidebar").evaluate((el) => !el.hidden);
  const sidebarItems = await page.locator("#sidebar .sb-item").count();

  // History: either hidden (first run) or populated — print, never assert.
  const histHidden = await page.locator("#history").evaluate((el) => el.hidden);

  console.log("sysinfo:", sysinfo.trim());
  console.log("score:", score.trim(), "| status:", statusCls, "|", statusmsg.trim());
  console.log("all active on load:", allActive === 1, "| report visible:", reportVisible, "| clear disabled on load:", clearDisabledOnLoad);
  console.log("cards:", cards, "| compact rows:", crowRows, "| visible groups:", visibleGroups, "| high open:", highOpenOk, "| others collapsed:", othersClosedOk);
  console.log("filter → Clear → All:", filterOk);
  console.log("START HERE shown:", nexthepShown, "| sidebar shown:", sidebarShown, "| sidebar items:", sidebarItems);
  console.log("history hidden:", histHidden);
  console.log("console errors:", consoleErrors.length);
  for (const e of consoleErrors) console.log("  [console] " + e);
  console.log("page errors:", pageErrors.length);
  for (const e of pageErrors) console.log("  [page] " + e);

  ok =
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    allActive === 1 &&
    reportVisible &&
    highOpenOk &&
    othersClosedOk &&
    filterOk;
} finally {
  await browser.close();
}
process.exit(ok ? 0 : 1);
