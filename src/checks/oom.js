import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * OOM kills — the #1 cause of "my app just disappeared" on 8–16 GB desktops.
 * Memory check catches pressure, but OOM is the hard kill that follows it.
 * Read-only: journalctl -k + dmesg, with fallbacks when journal is not available.
 */
export const oom = defineCheck({
  id: "oom",
  title: "Out-of-memory kills",
  category: "system",
  async run(ctx) {
    const [hasJournal, hasDmesg] = await Promise.all([
      ctx.run("command -v journalctl 2>/dev/null"),
      ctx.run("command -v dmesg 2>/dev/null"),
    ]);
    const hasLog = hasJournal.ok || hasDmesg.ok;
    const [kmsg, dmsg] = await Promise.all([
      ctx.run("journalctl -k --no-pager -n 500 2>/dev/null | grep -iE 'Out of memory|Killed process|oom-killer|oom_reaper' | tail -n 20"),
      ctx.run("dmesg 2>/dev/null | grep -iE 'Out of memory|Killed process|oom-killer' | tail -n 20"),
    ]);

    const combined = [...lines(kmsg.stdout), ...lines(dmsg.stdout)];
    // Deduplicate identical lines (journal + dmesg often duplicate)
    const uniq = [...new Set(combined)].filter(Boolean);

    if (uniq.length === 0) {
      if (!hasLog) return [];
      return [finding({
        severity: "info",
        code: "oom/ok",
        title: "No out-of-memory kills detected",
        detail: "The kernel has not killed any process for running out of memory in the recent log window. If the system recently froze, this confirms it was not an OOM kill.",
        evidence: "journalctl -k + dmesg: no OOM signature in last 500 lines",
        fix: null,
        confidence: "high",
      })];
    }

    // Count and show the most recent kills — the fix is the same regardless,
    // but the count tells the user if it is a one-off or a pattern.
    const sample = uniq.slice(-5).join("\n");
    const isRecent = uniq.length >= 2; // multiple kills = pattern = more urgent
    return [finding({
      severity: isRecent ? "high" : "medium",
      code: "oom/kills",
      title: `${uniq.length} OOM kill(s) in the recent kernel log`,
      detail: uniq.length === 1
        ? "The kernel killed a process to free memory. This is usually the direct cause of an app or desktop session disappearing under memory pressure."
        : `The kernel killed ${uniq.length} processes recently to free memory. Repeated OOM kills mean the system is consistently overcommitted — the heaviest app is being sacrificed.`,
      evidence: sample,
      fix: "Close the heaviest apps (check `systemd-cgtop` or `ps aux --sort=-%mem | head`), enable zram (`zramctl` or `systemd-zram-generator`), or add RAM. After freeing memory, clear the log with `sudo journalctl --vacuum-time=1s` and re-run.",
      confidence: "high",
    })];
  },
});
