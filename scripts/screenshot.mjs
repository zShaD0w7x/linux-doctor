/**
 * Regenerate the README dashboard screenshot.
 *
 * Usage:
 *   npm install --no-save playwright-core   # uses the cached Chromium, no download
 *   node scripts/screenshot.mjs
 *
 * Override the browser with CHROME_PATH=/path/to/chrome if needed.
 * Writes docs/screenshots/dashboard.png.
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { startWeb } from "../src/web.js";
import { run } from "../src/utils.js";
import { systemInfo } from "../src/checks/system.js";
import { memory } from "../src/checks/memory.js";
import { load } from "../src/checks/load.js";
import { disk } from "../src/checks/disk.js";
import { services } from "../src/checks/services.js";
import { journal } from "../src/checks/journal.js";
import { suspend } from "../src/checks/suspend.js";
import { security } from "../src/checks/security.js";
import { updates } from "../src/checks/updates.js";
import { processes } from "../src/checks/processes.js";
import { battery } from "../src/checks/battery.js";
import { gpu } from "../src/checks/gpu.js";

const CHECKS = [memory, load, disk, services, journal, suspend, security, updates, processes, battery, gpu];

const collect = async () => {
  const system = await systemInfo();
  const cctx = { run, osRelease: system.osRelease };
  const results = await Promise.all(CHECKS.map((c) => c.run(cctx)));
  const findings = results.flat().map((f, i) => ({ id: i + 1, ...f }));
  return { generatedAt: new Date().toISOString(), system, findings };
};

const server = await startWeb({ collect, open: false, port: 0 });
const url = `http://127.0.0.1:${server.address().port}`;

const exe =
  process.env.CHROME_PATH ||
  `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`;

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 960, height: 1200 }, deviceScaleFactor: 2 });
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#report .card", { timeout: 30000 });
  await page.waitForTimeout(600);
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/dashboard.png", fullPage: true });
  console.log("Saved docs/screenshots/dashboard.png");
} finally {
  await browser.close();
  server.close();
}
