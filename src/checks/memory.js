import { lines, num, fmtBytes } from "../utils.js";

export const memory = {
  id: "memory",
  title: "Memory pressure",
  async run(ctx) {
    const findings = [];
    const mem = await ctx.run("free -b");
    if (!mem.ok) return findings;

    const memLine = lines(mem.stdout).find((l) => l.startsWith("Mem:"));
    if (!memLine) return findings;
    const parts = memLine.split(/\s+/);
    const total = num(parts[1]);
    const available = num(parts[6]);
    const used = total - available;
    if (total === 0) return findings;

    const availRatio = available / total;
    let severity = null;
    if (availRatio < 0.15) severity = "high";
    else if (availRatio < 0.25) severity = "medium";

    const swap = await ctx.run("swapon --show --bytes");
    let swapUsed = 0;
    let swapTotal = 0;
    if (swap.ok) {
      for (const l of lines(swap.stdout).slice(1)) {
        const p = l.split(/\s+/);
        swapTotal += num(p[2]);
        swapUsed += num(p[3]);
      }
    }

    const swapped = swapUsed > 0 ? ` and ${fmtBytes(swapUsed)} is being pushed to swap` : "";
    if (severity) {
      findings.push({
        severity,
        title: "System is low on usable memory",
        detail: `Your system has ${fmtBytes(total)} of RAM, but only ${fmtBytes(available)} is usable right now (${fmtBytes(used)} in use${swapped}). Low memory is the most common cause of a sluggish Linux desktop.`,
        evidence: lines(mem.stdout).slice(0, 2).join("\n"),
        fix: "Close apps you are not using (especially browsers with many tabs), then re-run this check. If it stays low, consider adding RAM or enabling zram.",
        confidence: "high",
      });
    } else if (swapUsed > 0) {
      findings.push({
        severity: "info",
        title: "Swap is in use",
        detail: `${fmtBytes(swapUsed)} of ${fmtBytes(swapTotal)} swap is in use. Some swap activity is normal, but sustained swapping means the system is tight on memory.`,
        evidence: lines(swap.stdout).join("\n"),
        fix: "If apps feel slow, close memory-heavy apps and re-run this check.",
        confidence: "high",
      });
    }
    return findings;
  },
};
