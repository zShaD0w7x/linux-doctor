// SPDX-License-Identifier: GPL-3.0-or-later
import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";
import { pkgInstall } from "../distro.js";

/**
 * SSD TRIM health. Without periodic TRIM an SSD slowly loses write
 * performance and the drive cannot do wear leveling properly — a silent
 * degradation most users never notice until the disk feels old. Most distros
 * ship `fstrim.timer` (weekly TRIM); some setups instead mount filesystems
 * with the continuous `discard` option, which is equally fine. Read-only.
 */

export const fstrim = defineCheck({
  id: "fstrim",
  title: "SSD TRIM (fstrim)",
  category: "data",
  async run(ctx) {
    const findings = [];

    // Only relevant when at least one non-rotational device exists. ROTA=1 is
    // spinning rust; ROTA=0 covers SSDs and NVMe.
    const rota = await ctx.run("lsblk -dno NAME,ROTA 2>/dev/null");
    if (!rota.ok) {
      findings.push(finding({
        severity: "info",
        code: "fstrim/skipped",
        title: "TRIM check skipped",
        detail: "`lsblk` is not available, so the disk rotation type could not be determined and TRIM could not be checked.",
        evidence: "lsblk: not found",
        fix: `Install util-linux (${pkgInstall(ctx.dist, { fedora: "util-linux", "*": "util-linux" })}) and re-run.`,
        confidence: "high",
      }));
      return findings;
    }
    const ssds = lines(rota.stdout).filter((l) => {
      const name = l.trim().split(/\s+/)[0];
      // zram (RAM-backed swap), loop, ram, optical and floppy devices report
      // ROTA=0 but are not trimmable storage.
      if (/^(zram|loop|ram|sr|fd)/.test(name)) return false;
      return l.trim().endsWith("0");
    });
    if (ssds.length === 0) return findings; // HDD-only system: TRIM does not apply

    // Scheduled by whatever mechanism this host actually uses: the systemd
    // timer, openSUSE's Btrfs maintenance timer, or a cron/periodic script
    // (Void, Gentoo and Alpine have no fstrim unit at all). A systemd-only
    // probe reported working cron setups as "SSDs are never trimmed".
    const [fstrimTimer, btrfsTimer, cron] = await Promise.all([
      ctx.run("systemctl is-enabled fstrim.timer 2>/dev/null"),
      ctx.run("systemctl is-enabled btrfs-trim.timer 2>/dev/null"),
      ctx.run("grep -rl fstrim /etc/cron.d /etc/cron.daily /etc/cron.weekly /etc/cron.hourly /etc/periodic/weekly 2>/dev/null"),
    ]);
    const timerOn = [fstrimTimer, btrfsTimer].some((r) => r.ok && /^enabled/.test(r.stdout.trim()));
    const cronFiles = cron.ok ? lines(cron.stdout).filter(Boolean) : [];

    if (timerOn || cronFiles.length > 0) {
      const how = timerOn
        ? `${fstrimTimer.stdout.trim() === "enabled" ? "fstrim.timer" : "btrfs-trim.timer"} is enabled`
        : `scheduled by ${cronFiles[0]}`;
      findings.push(finding({
        severity: "info",
        code: "fstrim/ok",
        title: "SSD TRIM runs on a schedule",
        detail: "Your SSDs are trimmed periodically, so deleted blocks are returned to the drive and write performance stays steady.",
        evidence: ["lsblk -dno NAME,ROTA", rota.stdout.trim(), "", how].join("\n"),
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    // …or when some mounted filesystem uses continuous discard.
    const mounts = await ctx.run("findmnt -no OPTIONS -t ext4,xfs,btrfs,f2fs 2>/dev/null");
    if (mounts.ok && /\bdiscard\b/.test(mounts.stdout)) {
      findings.push(finding({
        severity: "info",
        code: "fstrim/ok-discard",
        title: "SSD TRIM runs continuously",
        detail: "Your filesystems are mounted with the discard option, so the kernel trims the SSD continuously as files are deleted. No weekly timer needed.",
        evidence: mounts.stdout.trim(),
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    const systemdAvailable = !fstrimTimer.missing;
    findings.push(finding({
      severity: "medium",
      code: "fstrim/disabled",
      title: "SSDs are never trimmed",
      detail: `You have ${ssds.length} solid-state device(s), but no TRIM mechanism is active: no trim timer is enabled, no cron entry runs fstrim, and no filesystem uses the discard mount option. Deleted blocks are never returned to the drive, so write performance degrades over weeks of use.`,
      evidence: ["lsblk -dno NAME,ROTA", rota.stdout.trim(), "", `fstrim.timer: ${fstrimTimer.stdout.trim() || "not found"}`].join("\n"),
      fix: systemdAvailable
        ? "Enable the weekly TRIM timer: `sudo systemctl enable --now fstrim.timer`. It runs quietly in the background once a week — nothing else to do."
        : "This system does not use systemd. Schedule a weekly trim with your init: a cron entry running `fstrim -a` (e.g. `/etc/cron.weekly/fstrim`), or the weekly service your init provides.",
      confidence: "high",
    }));
    return findings;
  },
});
