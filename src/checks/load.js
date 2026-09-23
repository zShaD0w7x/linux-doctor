// SPDX-License-Identifier: GPL-3.0-or-later
import { lines, num, plural } from "../utils.js";

import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

export const load = defineCheck({
  id: "load",
  title: "CPU load",
  category: "system",
  async run(ctx) {
    const findings = [];
    const t = ctx.thresholds;

    // /proc/loadavg is not namespaced: inside a container it is the HOST's load
    // average, while nproc reports the container's CPUs. Comparing the two
    // invents an overloaded system out of an idle container — all five test
    // images did it — so the check says so and stays quiet there.
    const virt = await ctx.run("systemd-detect-virt --container 2>/dev/null");
    const marker = await ctx.run("test -f /.dockerenv -o -f /run/.containerenv && echo container 2>/dev/null");
    const virtType = virt.ok ? virt.stdout.trim() : "";
    const inContainer = (virtType !== "" && virtType !== "none") || (marker.ok && /container/.test(marker.stdout));
    if (inContainer) {
      findings.push(finding({
        severity: "info",
        code: "load/skipped",
        title: "CPU load check skipped (container)",
        detail: "This looks like a container, and `/proc/loadavg` inside one is the host's load average, not this container's. Comparing it against the container's CPU count would invent an overloaded system, so the check stays quiet. Run it on the host for a real number.",
        evidence: `container detected: ${virtType && virtType !== "none" ? virtType : "container marker"}`,
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    const [loadRes, nprocRes] = await Promise.all([ctx.run("cat /proc/loadavg"), ctx.run("nproc")]);
    if (!loadRes.ok || !nprocRes.ok) return findings;

    const fields = lines(loadRes.stdout)[0]?.split(/\s+/) || [];
    const load1 = num(fields[0]);
    const cpus = num(nprocRes.stdout);
    if (cpus === 0 || load1 === 0) return findings;

    const ratio = load1 / cpus;
    if (ratio >= t.loadHighRatio) {
      findings.push(finding({
        severity: ratio >= t.loadCriticalRatio ? "high" : "medium",
        code: "load/overloaded",
        title: "CPU is overloaded",
        detail: `The 1-minute load average is ${load1.toFixed(2)} on a system with ${plural(cpus, "CPU core")}. Load at or above the core count means processes are waiting for CPU time, which makes the whole desktop feel slow.`,
        evidence: `load average: ${fields.join(" ")}\ncores: ${cpus}`,
        fix: "Find the process using the most CPU with `ps aux --sort=-%cpu | head` and close or restart it. Common culprits: browsers with many tabs, video encoding, or runaway processes.",
        confidence: "high",
      }));
    } else if (ratio >= t.loadWarnRatio) {
      findings.push(finding({
        severity: "info",
        code: "load/busy",
        title: "CPU is busy but not overloaded",
        detail: `Load average is ${load1.toFixed(2)} on ${plural(cpus, "core")}. The system is working, but there is still headroom.`,
        evidence: `load average: ${fields.join(" ")}`,
        fix: null,
        confidence: "high",
      }));
    }
    return findings;
  },
});
