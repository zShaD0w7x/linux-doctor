import { lines, plural, TIMEOUT_MS } from "../utils.js";
import { readCache, writeCache } from "../cache.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

const FLATPAK_CACHE_MS = 30 * 60 * 1000;

/**
 * Counts pending Flatpak app updates. `flatpak remote-ls --updates` only reads
 * the local metadata cache — it never refreshes remote metadata or changes
 * anything, so it is safe to run without network or sudo.
 */

export const flatpak = defineCheck({
  id: "flatpak",
  title: "Flatpak app updates",
  category: "updates",
  async run(ctx) {
    const ttlMs = Number(process.env.LINUX_DOCTOR_UPDATES_TTL_MS || FLATPAK_CACHE_MS);
    const isTest = process.argv.includes("--test") || process.env.NODE_ENV === "test" || !!process.env.VITEST || !!process.env.NODE_TEST_CONTEXT;
    const useCache = Number.isFinite(ttlMs) && ttlMs > 0 && !isTest;
    if (useCache) {
      const cached = readCache("flatpak", ttlMs);
      if (cached) return cached;
    }
    const findings = [];

    const res = await ctx.run("flatpak remote-ls --updates 2>/dev/null", { timeoutMs: TIMEOUT_MS.DAEMON });
    if (res.missing) {
      if (useCache) writeCache("flatpak", findings);
      return findings;
    }
    if (!res.ok && res.stdout.trim() === "") {
      if (useCache) writeCache("flatpak", findings);
      return findings;
    }

    // One line per pending update, e.g. "app/org.mozilla.firefox/x86_64/stable".
    const count = lines(res.stdout).filter((l) => l.includes("/")).length;

    // Unused runtimes — the hidden disk hog: `flatpak uninstall --unused`
    // lists runtimes no app needs any more (old Freedesktop/GNOME/KDE SDKs).
    // Pure dry-run, never removes anything.
    let unusedCount = 0;
    let unusedSample = "";
    try {
      const unused = await ctx.run("flatpak uninstall --unused --dry-run 2>/dev/null | grep -E '^[[:space:]]*(ID|runtime|org\\.)' | head -10", { timeoutMs: TIMEOUT_MS.DAEMON });
      if (unused.ok && unused.stdout.trim()) {
        const runtimes = lines(unused.stdout).filter((l) => l.includes("org.") || l.includes("runtime"));
        unusedCount = runtimes.length;
        // Fallback: count non-header lines when the grep pattern misses
        if (unusedCount === 0) {
          const alt = lines(unused.stdout).filter((l) => l.trim() && !/Nothing unused/i.test(l));
          unusedCount = alt.length;
          unusedSample = alt.slice(0, 3).join("\n");
        } else {
          unusedSample = runtimes.slice(0, 3).join("\n");
        }
      }
    } catch { /* flatpak dry-run failure is not a finding */ }

    if (count === 0) {
      findings.push(finding({
        severity: "info",
        code: "flatpak/none",
        title: "Flatpak apps are up to date",
        detail: "No pending Flatpak updates were found.",
        evidence: "flatpak: 0 updates",
        fix: null,
        confidence: "high",
      }));
    } else if (count <= 10) {
      findings.push(finding({
        severity: "info",
        code: "flatpak/pending",
        title: `${plural(count, "Flatpak update")} available`,
        detail: `There ${count === 1 ? "is" : "are"} ${plural(count, "Flatpak app update")} waiting. Updating keeps apps current with security fixes.`,
        evidence: `flatpak: ${count} pending`,
        fix: `Apply ${count === 1 ? "it" : "them"} with: \`flatpak update\``,
        confidence: "high",
      }));
    } else {
      findings.push(finding({
        severity: "medium",
        code: "flatpak/pending",
        title: `${count} Flatpak updates available`,
        detail: `There are ${count} Flatpak app updates waiting. A large backlog means security fixes are also pending.`,
        evidence: `flatpak: ${count} pending`,
        fix: "Apply them with: `flatpak update`",
        confidence: "high",
      }));
    }

    if (unusedCount > 0) {
      findings.push(finding({
        severity: unusedCount >= 3 ? "medium" : "info",
        code: "flatpak/unused-runtimes",
        title: `${plural(unusedCount, "unused Flatpak runtime")} can be removed`,
        detail: `${unusedCount} Flatpak runtime${unusedCount === 1 ? " is" : "s are"} installed but no app uses them any more (old SDKs). They waste disk space silently.`,
        evidence: unusedSample || `flatpak uninstall --unused --dry-run: ${unusedCount} removable`,
        fix: "Remove them with `flatpak uninstall --unused` and re-run.",
        confidence: "high",
      }));
    }

    if (useCache) writeCache("flatpak", findings);
    return findings;
  },
});
