import { fmtBytes, parseSize, TIMEOUT_MS } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Journal (systemd log) disk usage. A runaway journal is a classic cause of
 * "my disk filled up overnight" — the log grows silently until it hits its
 * size cap, and there is no visible warning. Reads only.
 */

export const journald = defineCheck({
  id: "journald",
  title: "Journal (systemd log) size",
  category: "system",
  async run(ctx) {
    const findings = [];

    const res = await ctx.run("journalctl --disk-usage 2>/dev/null", { timeoutMs: TIMEOUT_MS.JOURNAL });
    if (res.missing) {
      findings.push(finding({
        severity: "info",
        code: "journald/skipped",
        title: "Journal size check skipped",
        detail: "`journalctl` is not available on this system (no systemd journal), so log disk usage could not be checked.",
        evidence: "journalctl: not found",
        fix: null,
        confidence: "high",
      }));
      return findings;
    }
    if (!res.ok) {
      // Journal exists but the command failed — nothing we can say.
      return findings;
    }

    const size = parseSize(res.stdout);
    if (size <= 0) return findings; // could not parse the output — stay silent

    const friendly = fmtBytes(size);
    if (size >= ctx.thresholds.journalWarnBytes) {
      findings.push(finding({
        severity: "medium",
        code: "journald/large",
        title: "System journal is large",
        detail: `The systemd journal is using ${friendly}. It grows until it hits its size limit, and a runaway journal is a common cause of full disks.`,
        evidence: res.stdout.trim(),
        fix: "Trim it now with `sudo journalctl --vacuum-size=500M`, then cap it permanently: add `SystemMaxUse=500M` to /etc/systemd/journald.conf and run `sudo systemctl restart systemd-journald`.",
        confidence: "high",
      }));
    } else {
      findings.push(finding({
        severity: "info",
        code: "journald/ok",
        title: "Journal size is fine",
        detail: `The systemd journal is using ${friendly}, which is well within normal range.`,
        evidence: res.stdout.trim(),
        fix: null,
        confidence: "high",
      }));
    }
    return findings;
  },
});
