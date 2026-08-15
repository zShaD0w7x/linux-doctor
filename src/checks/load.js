import { lines, num } from "../utils.js";

export const load = {
  id: "load",
  title: "CPU load",
  async run(ctx) {
    const findings = [];
    const [loadRes, nprocRes] = await Promise.all([ctx.run("cat /proc/loadavg"), ctx.run("nproc")]);
    if (!loadRes.ok || !nprocRes.ok) return findings;

    const fields = lines(loadRes.stdout)[0]?.split(/\s+/) || [];
    const load1 = num(fields[0]);
    const cpus = num(nprocRes.stdout);
    if (cpus === 0 || load1 === 0) return findings;

    const ratio = load1 / cpus;
    if (ratio >= 1.0) {
      findings.push({
        severity: ratio >= 1.5 ? "high" : "medium",
        title: "CPU is overloaded",
        detail: `The 1-minute load average is ${load1.toFixed(2)} on a system with ${cpus} CPU core(s). Load at or above the core count means processes are waiting for CPU time, which makes the whole desktop feel slow.`,
        evidence: `load average: ${fields.join(" ")}\ncores: ${cpus}`,
        fix: "Find the process using the most CPU with `ps aux --sort=-%cpu | head` and close or restart it. Common culprits: browsers with many tabs, video encoding, or runaway processes.",
        confidence: "high",
      });
    } else if (ratio >= 0.7) {
      findings.push({
        severity: "info",
        title: "CPU is busy but not overloaded",
        detail: `Load average is ${load1.toFixed(2)} on ${cpus} core(s). The system is working, but there is still headroom.`,
        evidence: `load average: ${fields.join(" ")}`,
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
};
