import { lines, plural } from "../utils.js";

/**
 * Counts pending Flatpak app updates. `flatpak remote-ls --updates` only reads
 * the local metadata cache — it never refreshes remote metadata or changes
 * anything, so it is safe to run without network or sudo.
 */
import { defineCheck } from "./define.js";

export const flatpak = defineCheck({
  id: "flatpak",
  title: "Flatpak app updates",
  category: "updates",
  async run(ctx) {
    const findings = [];

    const res = await ctx.run("flatpak remote-ls --updates 2>/dev/null", { timeoutMs: 30000 });
    if (res.missing) {
      // Flatpak is not installed on this system — nothing to check.
      return findings;
    }
    if (!res.ok && res.stdout.trim() === "") return findings;

    // One line per pending update, e.g. "app/org.mozilla.firefox/x86_64/stable".
    const count = lines(res.stdout).filter((l) => l.includes("/")).length;

    if (count === 0) {
      findings.push({
        severity: "info",
        code: "flatpak/none",
        title: "Flatpak apps are up to date",
        detail: "No pending Flatpak updates were found.",
        evidence: "flatpak: 0 updates",
        fix: null,
        confidence: "high",
      });
    } else if (count <= 10) {
      findings.push({
        severity: "info",
        code: "flatpak/pending",
        title: `${plural(count, "Flatpak update")} available`,
        detail: `There ${count === 1 ? "is" : "are"} ${plural(count, "Flatpak app update")} waiting. Updating keeps apps current with security fixes.`,
        evidence: `flatpak: ${count} pending`,
        fix: `Apply ${count === 1 ? "it" : "them"} with: \`flatpak update\``,
        confidence: "high",
      });
    } else {
      findings.push({
        severity: "medium",
        code: "flatpak/pending",
        title: `${count} Flatpak updates available`,
        detail: `There are ${count} Flatpak app updates waiting. A large backlog means security fixes are also pending.`,
        evidence: `flatpak: ${count} pending`,
        fix: "Apply them with: `flatpak update`",
        confidence: "high",
      });
    }
    return findings;
  },
});
