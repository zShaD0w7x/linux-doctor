import { fmtBytes, parseSize, TIMEOUT_MS } from "../../utils.js";

import { defineCheck } from "../define.js";
import { finding } from "../../findings.js";

/**
 * Journal growth cap. The free journald check reports when the journal is
 * already large; this one checks whether a cap is configured at all — the
 * journal grows to its (often 4 GB) default limit and fills disks silently.
 * Read-only.
 */
export const journalcap = defineCheck({
  id: "journalcap",
  title: "Journal size cap",
  category: "system",
  premium: true,
  async run(ctx) {
    const findings = [];
    const capRes = await ctx.run("grep -rhE '^[^#]*SystemMaxUse=' /etc/systemd/journald.conf /etc/systemd/journald.conf.d/ 2>/dev/null");
    const capBytes = parseSize(capRes.stdout);

    const usage = await ctx.run("journalctl --disk-usage 2>/dev/null", { timeoutMs: TIMEOUT_MS.JOURNAL });
    const usedBytes = parseSize(usage.stdout);

    if (!capBytes) {
      findings.push(finding({
        severity: "medium",
        code: "journalcap/none",
        title: "System journal has no size cap",
        detail: "No SystemMaxUse is set in /etc/systemd/journald.conf, so the journal grows to systemd's default limit (often 4 GB) before it starts trimming — a silent disk-filler on long-running machines.",
        evidence: capRes.ok ? capRes.stdout.trim() : "SystemMaxUse: not set",
        fix: "Add `SystemMaxUse=500M` (and `SystemMaxFileSize=100M`) to /etc/systemd/journald.conf and run `sudo systemctl restart systemd-journald`. This caps the log permanently instead of the one-off `journalctl --vacuum-size` fix.",
        confidence: "high",
      }));
      return findings;
    }

    if (usedBytes > 0 && usedBytes > capBytes * 0.9) {
      findings.push(finding({
        severity: "medium",
        code: "journalcap/near",
        title: "Journal is near its configured cap",
        detail: `The journal is using ${fmtBytes(usedBytes)} of its ${fmtBytes(capBytes)} cap. Once it hits the cap, older logs are deleted and your most useful diagnostic history (past boots) is gone.`,
        evidence: usage.stdout.trim(),
        fix: "Vacuum the oldest logs now (`sudo journalctl --vacuum-size=300M`), and check nothing is writing excessive log volume (a chatty app or service).",
        confidence: "high",
      }));
    } else {
      findings.push(finding({
        severity: "info",
        code: "journalcap/ok",
        title: "Journal is capped and healthy",
        detail: `The journal is capped at ${fmtBytes(capBytes)} and currently uses ${usedBytes > 0 ? fmtBytes(usedBytes) : "an unknown amount"}.`,
        evidence: [capRes.stdout.trim(), usage.stdout.trim()].filter(Boolean).join("\n"),
        fix: null,
        confidence: "high",
      }));
    }
    return findings;
  },
});