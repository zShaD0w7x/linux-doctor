import { lines, num } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Swap / zram health. Swappiness over 100 tells the kernel to swap eagerly
 * (lag on any disk), and compressed swap at ~90% is a real hang risk.
 */

export const zram = defineCheck({
  id: "zram",
  title: "Swap and zram health",
  category: "system",
  async run(ctx) {
    const findings = [];

    const swappiness = await ctx.run("cat /proc/sys/vm/swappiness");
    const sw = swappiness.ok ? Number(swappiness.stdout.trim()) : null;

    const swap = await ctx.run("swapon --show --bytes");
    let zramTotal = 0;
    let zramUsed = 0;
    if (swap.ok) {
      for (const l of lines(swap.stdout).slice(1)) {
        const p = l.trim().split(/\s+/);
        if (p[0] && p[0].includes("zram")) {
          zramTotal += num(p[2]);
          zramUsed += num(p[3]);
        }
      }
    }

    if (zramTotal > 0 && zramUsed / zramTotal >= 0.9) {
      findings.push(finding({
        severity: "medium",
        code: "zram/full",
        title: "zram swap is nearly full",
        detail: "Compressed swap is over 90% used, so the kernel is left thrashing memory instead of swapping gracefully — the machine can feel frozen.",
        evidence: `${fmtMiB(zramUsed)} used of ${fmtMiB(zramTotal)} zram`,
        fix: "Close the apps using the most memory (`linux-doctor --check processes`). If it is chronic, raise the zram size (see your distro's zram docs) or add RAM.",
        confidence: "high",
      }));
    } else if (zramTotal > 0) {
      findings.push(finding({
        severity: "info",
        code: "zram/ok",
        title: "zram swap is healthy",
        detail: sw !== null && sw > 60
          ? "Compressed swap has room. Swappiness is above 60, so consider lowering it to keep the kernel in RAM."
          : "Compressed swap has room and swappiness looks sensible.",
        evidence: `${fmtMiB(zramUsed)} used of ${fmtMiB(zramTotal)} zram, swappiness ${sw ?? "?"}`,
        fix: null,
        confidence: "high",
      }));
    } else if (sw !== null && sw >= 100) {
      findings.push(finding({
        severity: "info",
        code: "zram/swappiness",
        title: "Swappiness is set very high",
        detail: "Swappiness ≥ 100 tells the kernel to swap eagerly, which causes lag even on an SSD. Most distros default to 60.",
        evidence: `vm.swappiness = ${sw}`,
        fix: "Lower it with `sudo sysctl vm.swappiness=60` (make it permanent in /etc/sysctl.d/).",
        confidence: "high",
      }));
    }
    return findings;
  },
});

function fmtMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)}MiB`;
}