import { lines, num, plural } from "../utils.js";

import { defineCheck } from "./define.js";

export const load = defineCheck({
  id: "load",
  title: "CPU load",
  category: "system",
  async run(ctx) {
    const findings = [];
    const t = ctx.thresholds;
    const [loadRes, nprocRes] = await Promise.all([ctx.run("cat /proc/loadavg"), ctx.run("nproc")]);
    if (!loadRes.ok || !nprocRes.ok) return findings;

    const fields = lines(loadRes.stdout)[0]?.split(/\s+/) || [];
    const load1 = num(fields[0]);
    const cpus = num(nprocRes.stdout);
    if (cpus === 0 || load1 === 0) return findings;

    const ratio = load1 / cpus;
    if (ratio >= t.loadHighRatio) {
      findings.push({
        severity: ratio >= t.loadCriticalRatio ? "high" : "medium",
        code: "load/overloaded",
        title: "CPU is overloaded",
        detail: `The 1-minute load average is ${load1.toFixed(2)} on a system with ${plural(cpus, "CPU core")}. Load at or above the core count means processes are waiting for CPU time, which makes the whole desktop feel slow.`,
        evidence: `load average: ${fields.join(" ")}\ncores: ${cpus}`,
        fix: "Find the process using the most CPU with `ps aux --sort=-%cpu | head` and close or restart it. Common culprits: browsers with many tabs, video encoding, or runaway processes.",
        confidence: "high",
      });
    } else if (ratio >= t.loadWarnRatio) {
      findings.push({
        severity: "info",
        code: "load/busy",
        title: "CPU is busy but not overloaded",
        detail: `Load average is ${load1.toFixed(2)} on ${plural(cpus, "core")}. The system is working, but there is still headroom.`,
        evidence: `load average: ${fields.join(" ")}`,
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
});
