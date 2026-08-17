import { fmtBytes } from "../utils.js";

/** Parse "3.2G", "512.0M", "1024B" into a byte count (0 when unparseable). */
export function parseSize(text) {
  const m = String(text || "").match(/([\d.]+)\s*([KMGTP]?B?)/i);
  if (!m) return 0;
  const unit = (m[2] || "").replace("B", "").toUpperCase() || "B";
  const mult = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[unit] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

/**
 * Journal (systemd log) disk usage. A runaway journal is a classic cause of
 * "my disk filled up overnight" — the log grows silently until it hits its
 * size cap, and there is no visible warning. Reads only.
 */
import { defineCheck } from "./define.js";

export const journald = defineCheck({
  id: "journald",
  title: "Journal (systemd log) size",
  category: "system",
  async run(ctx) {
    const findings = [];

    const res = await ctx.run("journalctl --disk-usage 2>/dev/null", { timeoutMs: 15000 });
    if (res.missing || !res.ok) {
      // No systemd journal (or it is not active) — nothing to check.
      return findings;
    }

    const size = parseSize(res.stdout);
    if (size <= 0) return findings; // could not parse the output — stay silent

    const friendly = fmtBytes(size);
    if (size >= ctx.thresholds.journalWarnBytes) {
      findings.push({
        severity: "medium",
        title: "System journal is large",
        detail: `The systemd journal is using ${friendly}. It grows until it hits its size limit, and a runaway journal is a common cause of full disks.`,
        evidence: res.stdout.trim(),
        fix: "Trim it now with `sudo journalctl --vacuum-size=500M`, then cap it permanently: add `SystemMaxUse=500M` to /etc/systemd/journald.conf and run `sudo systemctl restart systemd-journald`.",
        confidence: "high",
      });
    } else {
      findings.push({
        severity: "info",
        title: "Journal size is fine",
        detail: `The systemd journal is using ${friendly}, which is well within normal range.`,
        evidence: res.stdout.trim(),
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
});
