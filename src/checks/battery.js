import { lines, num } from "../utils.js";

export const battery = {
  id: "battery",
  title: "Battery",
  async run(ctx) {
    const findings = [];
    const res = await ctx.run(`ls /sys/class/power_supply/ 2>/dev/null`);
    if (!res.ok) return findings;

    const supplies = lines(res.stdout).filter((s) => !s.startsWith("AC") && !s.startsWith("ADP"));
    let found = false;
    for (const s of supplies) {
      const type = await ctx.run(`cat /sys/class/power_supply/${s}/type 2>/dev/null`);
      if (type.ok && type.stdout.trim() === "Battery") {
        found = true;
        const capacity = await ctx.run(`cat /sys/class/power_supply/${s}/capacity 2>/dev/null`);
        const status = await ctx.run(`cat /sys/class/power_supply/${s}/status 2>/dev/null`);
        const cap = num(capacity.stdout);
        if (cap < 20) {
          findings.push({
            severity: "medium",
            title: "Battery level is very low",
            detail: `The battery is at ${cap}%. Plug in the charger to avoid losing work.`,
            evidence: `${s}: capacity=${cap}% status=${status.stdout.trim() || "unknown"}`,
            fix: null,
            confidence: "high",
          });
        } else {
          findings.push({
            severity: "info",
            title: "Battery status",
            detail: `The battery is at ${cap}% and ${(status.stdout || "").trim().toLowerCase() || "idle"}.`,
            evidence: `${s}: capacity=${cap}% status=${status.stdout.trim() || "unknown"}`,
            fix: null,
            confidence: "high",
          });
        }
      }
    }
    if (!found) {
      findings.push({
        severity: "info",
        title: "No battery detected",
        detail: "This does not look like a laptop with a battery, so the battery check is skipped.",
        evidence: null,
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
};
