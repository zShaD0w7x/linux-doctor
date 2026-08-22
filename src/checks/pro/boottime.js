import { lines } from "../../utils.js";

import { defineCheck } from "../define.js";
import { finding } from "../../findings.js";

/**
 * Boot-time analysis via systemd-analyze. A slow boot is usually a handful of
 * units blocking the critical chain (network waiting, disks, udev settle);
 * the fix is almost always one bad unit, not the whole system. Read-only.
 */
export const boottime = defineCheck({
  id: "boottime",
  title: "Boot time",
  category: "system",
  premium: true,
  async run(ctx) {
    const findings = [];
    const res = await ctx.run("systemd-analyze 2>/dev/null");
    if (!res.ok || !res.stdout.trim()) return findings;
    const m = res.stdout.match(/Startup finished in .* = ([\d.]+)s/);
    const total = m ? parseFloat(m[1]) : null;
    if (total === null || !Number.isFinite(total)) return findings;

    const blame = await ctx.run("systemd-analyze blame --no-pager 2>/dev/null | head -3");
    const slowest = lines(blame.stdout);

    if (total > 60) {
      findings.push(finding({
        severity: "medium",
        code: "boottime/slow",
        title: "Boot is slow",
        detail: `The system takes ${total.toFixed(1)}s to boot. The slowest units are: ${slowest.join(", ") || "unavailable"}. One unit is almost always the bottleneck.`,
        evidence: [res.stdout.trim(), ...slowest].join("\n"),
        fix: "Find the bottleneck with `systemd-analyze critical-chain` and `systemd-analyze blame`, then disable or fix that one unit (`systemctl disable <unit>`). Network-wait and udev-settle units are common culprits.",
        confidence: "medium",
      }));
    } else {
      findings.push(finding({
        severity: "info",
        code: "boottime/ok",
        title: `Boot is fast (${total.toFixed(1)}s)`,
        detail: `The system finished booting in ${total.toFixed(1)}s, which is well within normal range.`,
        evidence: res.stdout.trim(),
        fix: null,
        confidence: "high",
      }));
    }
    return findings;
  },
});