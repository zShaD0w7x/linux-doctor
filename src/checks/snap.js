import { lines, plural, TIMEOUT_MS } from "../utils.js";
import { readCache, writeCache } from "../cache.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

const SNAP_CACHE_MS = 30 * 60 * 1000;

/**
 * Snap package health. `snap refresh --list` only lists available refreshes —
 * it never applies them — so it is safe to run read-only. Snap stores keep
 * old revisions for ~90 days; a stale cache therefore means fixes age out.
 */

export const snap = defineCheck({
  id: "snap",
  title: "Snap updates and refresh timer",
  category: "updates",
  async run(ctx) {
    const ttlMs = Number(process.env.LINUX_DOCTOR_UPDATES_TTL_MS || SNAP_CACHE_MS);
    const isTest = process.argv.includes("--test") || process.env.NODE_ENV === "test" || !!process.env.VITEST || !!process.env.NODE_TEST_CONTEXT;
    const useCache = Number.isFinite(ttlMs) && ttlMs > 0 && !isTest;
    if (useCache) {
      const cached = readCache("snap", ttlMs);
      if (cached) return cached;
    }
    const findings = [];

    const hasSnap = await ctx.run("command -v snap 2>/dev/null");
    if (!hasSnap.ok) {
      if (useCache) writeCache("snap", findings);
      return findings;
    }

    const pending = await ctx.run("snap refresh --list 2>/dev/null", { timeoutMs: TIMEOUT_MS.JOURNAL });
    let count = 0;
    if (pending.ok && pending.stdout.trim() !== "") {
      count = lines(pending.stdout).filter((l) => l.trim() !== "" && !/^Name\b/.test(l.trim())).length;
    } else {
      // --list needs root on some installs; at least confirm snap is in use.
      const any = await ctx.run("snap list 2>/dev/null");
      if (!any.ok || any.stdout.trim() === "") {
        if (useCache) writeCache("snap", findings);
        return findings;
      }
    }

    const timer = await ctx.run("systemctl list-timers snapd.* --no-pager 2>/dev/null");
    const timerActive = timer.ok && /snapd\.(refresh|daily)\.timer/.test(timer.stdout);

    if (count > 0) {
      findings.push(finding({
        severity: count > 5 ? "medium" : "info",
        code: "snap/pending",
        title: `${plural(count, "Snap update")} available`,
        detail: `${count} snap refresh${count === 1 ? " is" : "s are"} waiting. Snaps keep old revisions only ~90 days, so a backlog means security fixes are aging out.`,
        evidence: `snap refresh --list: ${count} pending`,
        fix: "Apply with `sudo snap refresh`.",
        confidence: "high",
      }));
    }
    if (!timerActive) {
      findings.push(finding({
        severity: "medium",
        code: "snap/no-timer",
        title: "Snap auto-refresh timer is disabled",
        detail: "Snap is installed but its auto-refresh systemd timer is not active, so snaps will go stale unless you refresh them manually.",
        evidence: timer.ok ? timer.stdout.trim() : "snapd.refresh.timer not found",
        fix: "Enable with `sudo systemctl enable --now snapd.refresh.timer`.",
        confidence: "medium",
      }));
    }
    if (count === 0 && timerActive) {
      findings.push(finding({
        severity: "info",
        code: "snap/ok",
        title: "Snaps are up to date",
        detail: "No pending snap refreshes and the auto-refresh timer is active.",
        evidence: "snap: 0 pending, timer active",
        fix: null,
        confidence: "medium",
      }));
    }
    if (useCache) writeCache("snap", findings);
    return findings;
  },
});