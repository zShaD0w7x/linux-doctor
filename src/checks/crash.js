import { lines } from "../utils.js";
import { defineCheck } from "./define.js";

/**
 * Crash and reboot history: unexpected restarts and coredumps are the #1
 * reason people reach for diagnostic tools after "my system just restarted".
 * Reads `journalctl --list-boots` for restart frequency and `coredumpctl list`
 * for recent crashes.  Read-only.
 */
export const crash = defineCheck({
  id: "crash",
  title: "Crash and reboot history",
  category: "system",
  async run(ctx) {
    const findings = [];

    // --- Unexpected reboots: many boots in a short window ---
    const boots = await ctx.run(
      'journalctl --list-boots --since "7 days ago" --no-pager 2>/dev/null | grep -v "^$"'
    );

    if (boots.missing) {
      findings.push({
        severity: "info",
        code: "crash/skipped",
        title: "Crash history check skipped",
        detail: "`journalctl` is not available on this system (non-systemd), so crash and reboot history could not be checked.",
        evidence: "journalctl: not found",
        fix: null,
        confidence: "high",
      });
      return findings;
    }

    if (boots.ok) {
      const bootCount = lines(boots.stdout).filter((l) => /^\s*-?\d+\s/.test(l)).length;
      // 7–14 boots/week is normal (reboots for updates, kernel switches);
      // >20 suggests instability.
      if (bootCount > 20) {
        findings.push({
          severity: "high",
          code: "crash/reboots",
          title: `${bootCount} reboots in the last 7 days`,
          detail: `The system rebooted ${bootCount} times in the past week — far more than the typical 7–14 from updates and kernel switches. Frequent reboots usually point to a kernel panic, a failing power supply, or an overheating CPU.`,
          evidence: `journalctl --list-boots --since "7 days ago" → ${bootCount} entries`,
          fix: "Check `journalctl -b -1 -p err` for the reason behind the most recent unexpected reboot, and look for kernel panics in `journalctl -k --since \"7 days ago\" | grep -i panic`.",
          confidence: "high",
        });
      } else if (bootCount > 14) {
        findings.push({
          severity: "medium",
          code: "crash/reboots",
          title: `${bootCount} reboots in the last 7 days`,
          detail: `The system rebooted ${bootCount} times in the past week. This is above the typical range and may indicate an issue — but it could also be normal if you installed several kernel updates.`,
          evidence: `journalctl --list-boots --since "7 days ago" → ${bootCount} entries`,
          fix: "If reboots were not intentional, check `journalctl -b -1 -p err` for the cause of the most recent one.",
          confidence: "medium",
        });
      }
    }

    // --- Coredumps: crashes in the last 24 hours ---
    const core = await ctx.run(
      'coredumpctl list --since "24 hours ago" --no-pager 2>/dev/null | tail -n +2'
    );

    if (core.ok && core.stdout.trim()) {
      // SIGTRAP cores come from debuggers and ptrace-based tools (gdb, some
      // emulators/JITs) — an intentional signal, not a crash. Everything else
      // (SIGSEGV, SIGABRT, SIGBUS, SIGILL, …) is a genuine crash. The signal
      // stays in the evidence so a user can see what actually happened.
      const crashes = lines(core.stdout)
        .filter((l) => !/^TIME\s/.test(l))
        .filter((l) => !/\sSIGTRAP\s/.test(` ${l} `));
      const crashCount = crashes.length;
      const top = crashes.slice(0, 3).join("\n");

      if (crashCount > 5) {
        findings.push({
          severity: "high",
          code: "crash/coredumps",
          title: `${crashCount} application crashes in the last 24 hours`,
          detail: `${crashCount} programs dumped core in the last 24 hours. A high crash rate usually points to a broken library, a faulty update, or a hardware issue (bad RAM).`,
          evidence: top,
          fix: "Inspect the most recent crash with `coredumpctl info <PID>`. If crashes are from the same program, check for updates or reinstall it. If from different programs, suspect hardware (run `memtest86+`).",
          confidence: "high",
        });
      } else if (crashCount > 0) {
        findings.push({
          severity: "medium",
          code: "crash/coredumps",
          title: `${crashCount} application crash(es) in the last 24 hours`,
          detail: `${crashCount} program(s) dumped core recently. Occasional crashes are normal, but a pattern may indicate a problem.`,
          evidence: top,
          fix: "Check `coredumpctl info <PID>` for the most recent crash to see which program failed and why.",
          confidence: "high",
        });
      }
    }

    return findings;
  },
});
