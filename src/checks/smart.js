import { lines, plural } from "../utils.js";

/**
 * Disk health via SMART. smartctl needs root to read most devices, so this
 * check degrades gracefully: missing smartmontools → silent; permission
 * denied → an informational finding telling the user to re-run with sudo;
 * unreadable for any other reason → silent.
 */
import { defineCheck } from "./define.js";

export const smart = defineCheck({
  id: "smart",
  title: "Disk health (SMART)",
  category: "hardware",
  async run(ctx) {
    const findings = [];

    const scan = await ctx.run("smartctl --scan 2>/dev/null");
    if (scan.missing || !scan.ok || scan.stdout.trim() === "") {
      // smartmontools not installed, or no SMART-capable devices.
      return findings;
    }

    const devices = [...new Set(lines(scan.stdout).map((l) => l.split(/\s+/)[0]).filter(Boolean))];

    let checked = 0;
    let blocked = false;
    for (const dev of devices.slice(0, 4)) {
      const res = await ctx.run(`smartctl -H -c ${dev} 2>/dev/null`, { timeoutMs: 10000 });
      if (!res.ok) {
        // Permission denied (SMART reads usually need root) — say so once.
        if (/permission/i.test(res.stderr || "")) blocked = true;
        continue; // unsupported device — skip silently
      }
      const text = res.stdout;
      if (/FAILING_NOW|FAILED/.test(text)) {
        findings.push({
          severity: "high",
          title: `${dev} reports failing SMART health`,
          detail:
            "The disk's self-assessment reports a failing or failing-now status. This is a strong warning that the drive may fail soon.",
          evidence: text.split("\n").filter((l) => /health|FAILED|FAILING/i.test(l)).join("\n").slice(0, 400),
          fix: `Back up everything on this disk immediately, then test it with \`sudo smartctl -t long ${dev}\`. Replace the drive if the test fails.`,
          confidence: "high",
        });
      } else if (/PASSED|OK/.test(text)) {
        checked += 1;
      }
    }

    if (findings.length === 0 && checked > 0) {
      findings.push({
        severity: "info",
        title: "Disk health is good",
        detail: `SMART reports healthy status for ${plural(checked, "disk")}.`,
        evidence: `${plural(checked, "device")} passed`,
        fix: null,
        confidence: "high",
      });
    } else if (findings.length === 0 && blocked && checked === 0) {
      findings.push({
        severity: "info",
        title: "SMART disk health not checked (needs root)",
        detail:
          "smartctl is installed, but reading SMART status requires root. Re-run with `sudo linux-doctor` to enable disk health checks.",
        evidence: "smartctl: could not read device status without root",
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
});
