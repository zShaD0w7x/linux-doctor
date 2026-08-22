import { lines, num, shq } from "../utils.js";

import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

export const battery = defineCheck({
  id: "battery",
  title: "Battery",
  category: "hardware",
  appliesTo: ["laptop"],
  async run(ctx) {
    const findings = [];
    // Supply names come from readdir, but every interpolated path is quoted
    // anyway — a crafted name must never reach the shell unquoted.
    const sysfs = (s, prop) => shq(`/sys/class/power_supply/${s}/${prop}`);
    const res = await ctx.run(`ls /sys/class/power_supply/ 2>/dev/null`);
    if (!res.ok) return findings;

    // Wireless-device "batteries" (Logitech receivers, game controllers)
    // show up here with type Battery but are not laptop batteries.
    const supplies = lines(res.stdout).filter((s) => !s.startsWith("AC") && !s.startsWith("ADP") && !/hidpp|controller/i.test(s));

    // Two parallel phases: identify batteries first, then read capacity and
    // status only for the supplies that are actually batteries.
    const types = await Promise.all(
      supplies.map(async (s) => ({
        s,
        type: (await ctx.run(`cat ${sysfs(s, "type")} 2>/dev/null`)).stdout.trim(),
      }))
    );
    const batteries = types.filter((t) => t.type === "Battery");

    const states = await Promise.all(
      batteries.map(async ({ s }) => {
        const [capacity, status, full, fullDesign] = await Promise.all([
          ctx.run(`cat ${sysfs(s, "capacity")} 2>/dev/null`),
          ctx.run(`cat ${sysfs(s, "status")} 2>/dev/null`),
          ctx.run(`cat ${sysfs(s, "charge_full")} 2>/dev/null`),
          ctx.run(`cat ${sysfs(s, "charge_full_design")} 2>/dev/null`),
        ]);
        const design = num(fullDesign.stdout);
        return {
          s,
          cap: num(capacity.stdout),
          status: status.stdout.trim(),
          // Capacity lost to wear, e.g. 30 = the battery now holds 30% less
          // than it did when new (0 when the values are unavailable).
          wear: design > 0 ? Math.round((1 - num(full.stdout) / design) * 100) : null,
        };
      })
    );

    for (const { s, cap, status, wear } of states) {
      if (cap < 20) {
        findings.push(finding({
          severity: "medium",
          code: "battery/low",
          title: "Battery level is very low",
          detail: `The battery is at ${cap}%. Plug in the charger to avoid losing work.`,
          evidence: `${s}: capacity=${cap}% status=${status || "unknown"}`,
          fix: null,
          confidence: "high",
        }));
      } else {
        findings.push(finding({
          severity: "info",
          code: "battery/status",
          title: "Battery status",
          detail: `The battery is at ${cap}% and ${status.toLowerCase() || "idle"}.`,
          evidence: `${s}: capacity=${cap}% status=${status || "unknown"}`,
          fix: null,
          confidence: "high",
        }));
      }

      if (wear !== null && wear >= 40) {
        findings.push(finding({
          severity: "medium",
          code: "battery/wear",
          title: "Battery has lost a lot of capacity",
          detail: `The battery now holds ${100 - wear}% of its design capacity (${wear}% wear). It may start shutting down unexpectedly under load.`,
          evidence: `${s}: ${wear}% wear`,
          fix: "If it shuts down before reaching 0%, consider replacing the battery. Until then, keep it charged and avoid draining it to empty.",
          confidence: "high",
        }));
      } else if (wear !== null && wear >= 20) {
        findings.push(finding({
          severity: "info",
          code: "battery/wear",
          title: "Battery is showing wear",
          detail: `The battery now holds ${100 - wear}% of its design capacity (${wear}% wear). This is normal aging, but worth monitoring.`,
          evidence: `${s}: ${wear}% wear`,
          fix: null,
          confidence: "high",
        }));
      }
    }

    if (batteries.length === 0) {
      findings.push(finding({
        severity: "info",
        code: "battery/none",
        title: "No battery detected",
        detail: "This does not look like a laptop with a battery, so the battery check is skipped.",
        evidence: null,
        fix: null,
        confidence: "high",
      }));
    }
    return findings;
  },
});
