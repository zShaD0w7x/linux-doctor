import { finding } from "../findings.js";
import { defineCheck } from "./define.js";

/**
 * File-descriptor pressure: the classic "server dies mysteriously" cause.
 * When the kernel runs out of file handles, everything fails at once with
 * "Too many open files" and no single metric spikes — observability rarely
 * tracks FDs. One read-only counter (`/proc/sys/fs/file-nr`, no root
 * needed) is enough to see it coming.
 *
 * On 2.6+ kernels the middle number is always 0, so allocated == in use and
 * the allocated/max ratio is meaningful. Ratios are kernel-level constants,
 * not workload tuning — hence fixed, not thresholds.
 */

export const fds = defineCheck({
  id: "fds",
  title: "File descriptor pressure",
  category: "system",
  appliesTo: ["server"],
  async run(ctx) {
    const res = await ctx.run("cat /proc/sys/fs/file-nr 2>/dev/null");
    if (!res.ok) return [];
    const [alloc, , max] = res.stdout.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(alloc) || !Number.isFinite(max) || max <= 0) return [];
    const ratio = alloc / max;

    if (ratio < 0.9) return [];

    const pct = Math.round(ratio * 100);
    const detail = `${alloc.toLocaleString("en-US")} of ${max.toLocaleString("en-US")} file handles are allocated (${pct}% of the kernel limit). New opens will soon fail with "Too many open files" across every process on the machine.`;
    return [finding({
      severity: ratio >= 0.95 ? "high" : "medium",
      code: "fds/exhausted",
      title: `File handles nearly exhausted (${pct}% used)`,
      detail,
      evidence: `file-nr: ${res.stdout.trim()}`,
      fix: "Find the hungriest process (`ls /proc/*/fd | sort | uniq -c | sort -rn | head`), then raise the limit (`sysctl -w fs.file-max=<n>`, persisted in /etc/sysctl.conf) or fix the leak.",
      confidence: "high",
    })];
  },
});
