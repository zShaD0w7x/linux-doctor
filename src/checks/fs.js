import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Filesystem errors — EXT4/XFS/BTRFS I/O errors and read-only remounts.
 * These are rare but catastrophic when they happen, and `disk` (full) does
 * not catch them — a filesystem can be 30% full and still be corrupt.
 * Read-only: dmesg + journalctl -k, bounded to recent 500 lines.
 */
export const fs = defineCheck({
  id: "fs",
  title: "Filesystem errors",
  category: "system",
  async run(ctx) {
    const [hasJournal, hasDmesg] = await Promise.all([
      ctx.run("command -v journalctl 2>/dev/null"),
      ctx.run("command -v dmesg 2>/dev/null"),
    ]);
    const hasLog = hasJournal.ok || hasDmesg.ok;
    const [kmsg, dmsg, ro] = await Promise.all([
      ctx.run("journalctl -k --no-pager -n 500 2>/dev/null | grep -iE 'EXT4-fs error|I/O error|buffer I/O error|BTRFS.*error|btrfs.*error|XFS.*error|xfs.*error|I/O stall' | tail -n 20"),
      ctx.run("dmesg 2>/dev/null | grep -iE 'EXT4-fs error|I/O error|buffer I/O error|BTRFS|Remounting filesystem read-only' | tail -n 20"),
      ctx.run("dmesg 2>/dev/null | grep -i 'Remounting filesystem read-only' | tail -n 5"),
    ]);

    const combined = [...lines(kmsg.stdout), ...lines(dmsg.stdout)];
    const uniq = [...new Set(combined)].filter(Boolean);
    const roLines = lines(ro.stdout).filter(Boolean);

    // Read-only remount is the most user-visible symptom — promote it.
    if (roLines.length > 0) {
      return [finding({
        severity: "high",
        code: "fs/readonly-remount",
        title: "Filesystem was remounted read-only",
        detail: "The kernel remounted a filesystem read-only after an I/O error. Writes now fail silently and the system is at risk of data loss — this is the classic symptom of a failing disk or a corrupt filesystem.",
        evidence: roLines.slice(-5).join("\n"),
        fix: "Do not write further if possible. Check `dmesg | tail -n 100`, run `sudo smartctl -a /dev/nvme0n1` (or /dev/sda), and schedule `sudo fsck` or `btrfs check` from a live USB. Back up immediately.",
        confidence: "high",
      })];
    }

    if (uniq.length === 0) {
      if (!hasLog) return [];
      return [finding({
        severity: "info",
        code: "fs/ok",
        title: "No filesystem errors in the recent log",
        detail: "No EXT4/BTRFS/XFS I/O errors were seen in the last 500 kernel messages. This does not guarantee the disk is healthy, but there is no active filesystem corruption signal.",
        evidence: "journalctl -k + dmesg: no FS error in last 500 lines",
        fix: null,
        confidence: "high",
      })];
    }

    const sample = uniq.slice(-5).join("\n");
    const isBtrfs = /btrfs/i.test(sample);
    return [finding({
      severity: "high",
      code: isBtrfs ? "fs/btrfs-errors" : "fs/io-errors",
      title: `${uniq.length} filesystem error(s) in the recent log`,
      detail: isBtrfs
        ? "BTRFS reported I/O or checksum errors. BTRFS is copy-on-write and will retry, but repeated errors mean the device is failing or the filesystem needs a scrub/balance."
        : "The kernel logged filesystem I/O errors. Even a few are worth investigating — they often precede a full disk failure.",
      evidence: sample,
      fix: isBtrfs
        ? "Run `sudo btrfs scrub start / && sudo btrfs scrub status /` and `sudo btrfs device stats /`. If errors persist, back up and replace the device."
        : "Run `sudo smartctl -a /dev/nvme0n1` (or /dev/sda), `sudo dmesg | grep -i error`, and schedule a filesystem check from a live USB if needed.",
      confidence: "high",
    })];
  },
});
