// SPDX-License-Identifier: GPL-3.0-or-later
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

    const res = await ctx.run("flatpak remote-ls --updates --columns=application,version 2>/dev/null", { timeoutMs: TIMEOUT_MS.DAEMON });
    if (res.missing) {
      if (useCache) writeCache("flatpak", findings);
      return findings;
    }

    // `--columns=application,version` prints one app per line, no header and no
    // table formatting, so the count is exact. The default output is a column
    // table whose fields contain no "/", and the old count of lines containing
    // "/" therefore read zero on a machine with pending updates: it reported
    // "Flatpak apps are up to date" while four updates were waiting.
    let count = lines(res.stdout).filter((l) => l.trim() !== "").length;
    if (!res.ok && !res.stdout.trim()) {
      // Older flatpak without --columns: fall back to the table and count rows.
      const legacy = await ctx.run("flatpak remote-ls --updates 2>/dev/null", { timeoutMs: TIMEOUT_MS.DAEMON });
      const rows = lines(legacy.stdout).filter(
        (l) => l.trim() !== "" && !/^\s*(?:name|application id)\b/i.test(l) && l.trim().split(/\s+/).length >= 2,
      );
      count = rows.length;
    }

    // Unused runtimes are deliberately NOT reported. flatpak's CLI exposes no
    // read-only way to ask: `flatpak uninstall` has never had `--dry-run`
    // (absent in every release, so the old probe could only error and be
    // swallowed by its catch), `--noninteractive`/`-y` delete, and the prompt
    // defaults to yes. The obvious shell approximation — installed runtimes
    // minus the runtimes apps reference — was tried and is wrong: on the
    // maintainer's box it said "30 unused" where flatpak itself says "Nothing
    // unused to uninstall", because extensions (LinuxAudio plugins, VAAPI
    // drivers, locales, KStyle) are not listed as any app's runtime. Telling
    // someone to delete runtimes flatpak considers in use is exactly the kind
    // of false alarm this tool exists to avoid, so it stays silent and leaves
    // `flatpak uninstall --unused` to the user.

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

    if (useCache) writeCache("flatpak", findings);
    return findings;
  },
});
