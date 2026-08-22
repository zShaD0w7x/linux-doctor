import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

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
    if (!rota.ok) return findings; // lsblk missing — nothing we can say
    const ssds = lines(rota.stdout).filter((l) => l.trim().endsWith("0"));
    if (ssds.length === 0) return findings; // HDD-only system: TRIM does not apply

    // Covered when the weekly timer is enabled…
    const enabled = await ctx.run("systemctl is-enabled fstrim.timer 2>/dev/null");
    if (enabled.ok && enabled.stdout.trim() === "enabled") {
      const seen = await ctx.run("systemctl show fstrim.timer -p LastTriggerUSec --value 2>/dev/null");
      findings.push(finding({
        severity: "info",
        code: "fstrim/ok",
        title: "SSD TRIM runs weekly",
        detail: "The fstrim timer is enabled, so your SSDs are trimmed every week. TRIM lets the drive erase unused blocks in the background, which keeps write performance steady.",
        evidence: ["lsblk -dno NAME,ROTA", rota.stdout.trim(), "", `Last trigger: ${(seen.stdout || "").trim() || "unknown"}`].join("\n"),
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

    findings.push(finding({
      severity: "medium",
      code: "fstrim/disabled",
      title: "SSDs are never trimmed",
      detail: `You have ${ssds.length} solid-state device(s), but no TRIM mechanism is active: the fstrim.timer service is disabled and no filesystem uses the discard mount option. Deleted blocks are never returned to the drive, so write performance degrades over weeks of use.`,
      evidence: ["lsblk -dno NAME,ROTA", rota.stdout.trim(), "", `fstrim.timer: ${enabled.stdout.trim() || "not found"}`].join("\n"),
      fix: "Enable the weekly TRIM timer: `sudo systemctl enable --now fstrim.timer`. It runs quietly in the background once a week — nothing else to do.",
      confidence: "high",
    }));
    return findings;
  },
});
