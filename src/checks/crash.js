import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Crash and reboot history: unexpected restarts and coredumps are the #1
 * reason people reach for diagnostic tools after "my system just restarted".
 * Reads `journalctl --list-boots` for restart frequency and `coredumpctl list`
 * for recent crashes. Read-only.
 *
 * Boot count alone is a weak instability signal: image-based distros (Bazzite,
 * Fedora Atomic, …) reboot for every automatic update, and plenty of people
 * reboot on purpose. So a high boot count only becomes a finding after we look
 * for real crash evidence (kernel panics, oopses, machine-check/hardware
 * errors) and check whether an automatic-update mechanism explains the reboots.
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
      findings.push(finding({
        severity: "info",
        code: "crash/skipped",
        title: "Crash history check skipped",
        detail: "`journalctl` is not available on this system (non-systemd), so crash and reboot history could not be checked.",
        evidence: "journalctl: not found",
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    if (boots.ok) {
      const bootCount = lines(boots.stdout).filter((l) => /^\s*-?\d+\s/.test(l)).length;

      // 7–14 boots/week is normal (reboots for updates, kernel switches);
      // >14 is worth explaining. Only then do we pay for the extra commands.
      if (bootCount > 14) {
        // Real crash evidence, not the "Registered … planes with drm panic"
        // notifier lines that a plain `grep -i panic` would match.
        const kernelLog = await ctx.run(
          'journalctl -k --since "7 days ago" --no-pager 2>/dev/null | grep -iE "Kernel panic|Oops:|BUG: kernel|kernel BUG|machine check|Hardware Error|watchdog: BUG"'
        );
        const crashLines = kernelLog.ok && kernelLog.stdout.trim()
          ? lines(kernelLog.stdout).slice(0, 3)
          : [];

        const autoUpdate = await detectAutoUpdate(ctx);

        if (crashLines.length > 0) {
          findings.push(finding({
            severity: "high",
            code: "crash/panic",
            title: `Kernel or hardware errors detected in the last 7 days`,
            detail: `The kernel log contains panic/oops or hardware-error messages from the past week (the system rebooted ${bootCount} times in the same window). These are the events worth investigating — a crash, not an update, is the likely culprit.`,
            evidence: crashLines.join("\n"),
            fix: "Inspect the most recent event: `journalctl -k -b -1 | tail -120`. Machine-check/hardware errors usually mean bad RAM or overheating (run `memtest86+`); a `BUG:`/`Oops:` may be a kernel bug — check for a newer kernel. Software crash? Look at `coredumpctl info <PID>` below.",
            confidence: "high",
          }));
        } else if (autoUpdate.active) {
          // On atomic/image-based distros every applied update needs a reboot,
          // so many boots + no crash evidence = expected behavior.
          findings.push(finding({
            severity: bootCount > 20 ? "medium" : "info",
            code: "crash/reboots",
            title: `${bootCount} reboots in the last 7 days`,
            detail: `The system rebooted ${bootCount} times in the past week, which lines up with automatic updates (${autoUpdate.evidence}). No kernel panic or hardware error was found in the log — on an image-based distro each update applies on reboot, so this is expected rather than a sign of instability.`,
            evidence: `journalctl --list-boots --since "7 days ago" → ${bootCount} entries · no kernel panic / hardware errors found`,
            fix: "If the reboots were not actually caused by updates (or were not intentional), check `journalctl -b -1 -p err` for the reason behind the most recent one.",
            confidence: "high",
          }));
        } else if (bootCount > 20) {
          findings.push(finding({
            severity: "high",
            code: "crash/reboots",
            title: `${bootCount} reboots in the last 7 days`,
            detail: `The system rebooted ${bootCount} times in the past week — far more than the typical 7–14 from updates and kernel switches. Frequent reboots usually point to a kernel panic, a failing power supply, or an overheating CPU.`,
            evidence: `journalctl --list-boots --since "7 days ago" → ${bootCount} entries`,
            fix: "Check `journalctl -b -1 -p err` for the reason behind the most recent unexpected reboot, and look for kernel panics in `journalctl -k --since \"7 days ago\" | grep -i \"kernel panic\"`.",
            confidence: "high",
          }));
        } else {
          findings.push(finding({
            severity: "medium",
            code: "crash/reboots",
            title: `${bootCount} reboots in the last 7 days`,
            detail: `The system rebooted ${bootCount} times in the past week. This is above the typical range and may indicate an issue — but it could also be normal if you installed several kernel updates.`,
            evidence: `journalctl --list-boots --since "7 days ago" → ${bootCount} entries`,
            fix: "If reboots were not intentional, check `journalctl -b -1 -p err` for the cause of the most recent one.",
            confidence: "medium",
          }));
        }
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
        findings.push(finding({
          severity: "high",
          code: "crash/coredumps",
          title: `${crashCount} application crashes in the last 24 hours`,
          detail: `${crashCount} programs dumped core in the last 24 hours. A high crash rate usually points to a broken library, a faulty update, or a hardware issue (bad RAM).`,
          evidence: top,
          fix: "Inspect the most recent crash with `coredumpctl info <PID>`. If crashes are from the same program, check for updates or reinstall it. If from different programs, suspect hardware (run `memtest86+`).",
          confidence: "high",
        }));
      } else if (crashCount > 0) {
        findings.push(finding({
          severity: "medium",
          code: "crash/coredumps",
          title: `${crashCount} application crash(es) in the last 24 hours`,
          detail: `${crashCount} program(s) dumped core recently. Occasional crashes are normal, but a pattern may indicate a problem.`,
          evidence: top,
          fix: "Check `coredumpctl info <PID>` for the most recent crash to see which program failed and why.",
          confidence: "high",
        }));
      }
    }

    return findings;
  },
});

// Is there an automatic-update mechanism that would explain reboots? Image
// based (rpm-ostree/uupd, PackageKit offline updates) and classic distros
// (dnf-automatic, apt-daily-upgrade, unattended-upgrades) all apply updates on
// or around reboot. Timer units are the stable cross-distro signal; uupd and
// rpm-ostree binaries confirm the image-based case.
async function detectAutoUpdate(ctx) {
  const timers = await ctx.run(
    'systemctl list-timers --all --no-pager 2>/dev/null | grep -ioE "uupd\\.timer|rpm-ostree-autoupdate\\.timer|packagekit[a-z-]*\\.service|dnf-automatic[a-z-]*\\.timer|apt-daily[-a-z]*\\.timer|unattended-upgrades\\.service"'
  );
  const bins = await ctx.run("command -v uupd rpm-ostree 2>/dev/null");
  const evidence = [];
  if (timers.ok && timers.stdout.trim()) evidence.push(timers.stdout.trim().split("\n")[0].trim().toLowerCase());
  if (bins.ok && bins.stdout.trim()) evidence.push(lines(bins.stdout).join(", "));
  return { active: evidence.length > 0, evidence: [...new Set(evidence)].join(", ") || "automatic update timers" };
}
