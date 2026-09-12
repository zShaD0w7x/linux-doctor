import { lines, shq } from "../utils.js";
import { finding } from "../findings.js";
import { defineCheck } from "./define.js";

/**
 * File-descriptor pressure: the classic "server dies mysteriously" cause.
 * When a process runs out of file handles, everything it does fails at once
 * with "Too many open files" and no single metric spikes.
 *
 * Two signals, because one alone is not enough:
 *  - system-wide: `/proc/sys/fs/file-nr` allocated vs `fs.file-max`. Modern
 *    kernels set file-max to LONG_MAX, which makes that ratio ~0 forever, so
 *    it is only trusted when file-max is a plausible bound.
 *  - per-process: the top descriptor holders vs their own RLIMIT_NOFILE soft
 *    limit from `/proc/<pid>/limits` — the actual failure mode ("too many
 *    open files" is a per-process limit), independent of file-max.
 */

const TOP_FD_HOLDERS =
  'for p in /proc/[0-9]*; do n=$(ls "$p/fd" 2>/dev/null | wc -l); [ "$n" -gt 0 ] && echo "$n ${p##*/}"; done | sort -rn | head -3';

export const fds = defineCheck({
  id: "fds",
  title: "File descriptor pressure",
  category: "system",
  appliesTo: ["server"],
  async run(ctx) {
    const findings = [];

    // --- System-wide (only when file-max is a real bound) ---
    const res = await ctx.run("cat /proc/sys/fs/file-nr 2>/dev/null");
    if (res.ok) {
      const [alloc, , max] = res.stdout.trim().split(/\s+/).map(Number);
      const SANE_MAX = 2 ** 31;
      if (Number.isFinite(alloc) && Number.isFinite(max) && max > 0 && max < SANE_MAX) {
        const ratio = alloc / max;
        if (ratio >= 0.9) {
          const pct = Math.round(ratio * 100);
          return [finding({
            severity: ratio >= 0.95 ? "high" : "medium",
            code: "fds/exhausted",
            title: `File handles nearly exhausted (${pct}% used)`,
            detail: `${alloc.toLocaleString("en-US")} of ${max.toLocaleString("en-US")} file handles are allocated (${pct}% of the kernel limit). New opens will soon fail with "Too many open files" across every process on the machine.`,
            evidence: `file-nr: ${res.stdout.trim()}`,
            fix: "Find the hungriest process (`ls /proc/*/fd | sort | uniq -c | sort -rn | head`), then raise the limit (`sysctl -w fs.file-max=<n>`, persisted in /etc/sysctl.conf) or fix the leak.",
            confidence: "high",
          })];
        }
      }
    }

    // --- Per-process pressure against RLIMIT_NOFILE ---
    const top = await ctx.run(TOP_FD_HOLDERS);
    if (!top.ok) return findings;
    for (const line of lines(top.stdout)) {
      const [countStr, pid] = line.trim().split(/\s+/);
      const count = Number(countStr);
      if (!Number.isFinite(count) || count < 100) continue;
      // Parse the soft RLIMIT_NOFILE in JS (quoting an awk program inside the
      // command is fragile; head + a local parse is not).
      const lim = await ctx.run(`head -40 /proc/${shq(pid)}/limits 2>/dev/null`);
      const softLine = lines(lim.stdout).find((l) => /^Max open files\b/.test(l));
      const limit = softLine ? Number(softLine.trim().split(/\s+/)[3]) : NaN;
      if (!Number.isFinite(limit) || limit <= 0) continue;
      const ratio = count / limit;
      if (ratio < 0.8) continue;
      const nameRes = await ctx.run(`cat /proc/${shq(pid)}/comm 2>/dev/null`);
      const name = nameRes.stdout.trim() || `pid ${pid}`;
      const pct = Math.round(ratio * 100);
      findings.push(finding({
        severity: ratio >= 0.9 ? "high" : "medium",
        code: "fds/exhausted",
        title: `${name} is using ${pct}% of its file-descriptor limit`,
        detail: `Process ${name} (pid ${pid}) holds ${count} open file descriptors against a soft limit of ${limit} (${pct}%). When it reaches the limit, new opens fail with "Too many open files" for that process.`,
        evidence: `pid ${pid} (${name}): ${count}/${limit} fds`,
        fix: `Raise the limit for the service (systemd LimitNOFILE=, or /etc/security/limits.conf) or find the leak (\`lsof -p ${pid}\`).`,
        confidence: "high",
      }));
      break; // one clear culprit is enough
    }
    return findings;
  },
});
