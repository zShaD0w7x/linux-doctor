import { lines, pct, num } from "../utils.js";
import { finding } from "../findings.js";
import { defineCheck } from "./define.js";

/**
 * Inode exhaustion — the classic "No space left on device" when `df -h`
 * shows free space. A filesystem can be 60% full on bytes but 100% full
 * on inodes (millions of tiny files: caches, maildirs, node_modules).
 * `df -i` reports it; most users never check it.
 *
 * Excludes the same pseudo-filesystems as `disk` — tmpfs, overlay etc.
 * also have inode tables but they are not the user's data partition.
 */
const EXCLUDED_FS = new Set([
  "tmpfs", "devtmpfs", "squashfs", "overlay", "proc", "sysfs",
  "cgroup2", "efivarfs", "securityfs", "debugfs", "tracefs", "fusectl",
  "devpts", "mqueue", "configfs", "binfmt_misc", "autofs", "ramfs",
  "bpf", "pstore", "hugetlbfs",
]);

function inodeFinding({ mount, use, evidence, root = false, t, device }) {
  const label = root ? "Root partition" : `Partition ${mount}`;
  if (use >= t.inodeFullPct) {
    return finding({
      severity: "high",
      code: "inodes/full",
      dedupeKey: `inodes:${device}`,
      title: `${label} has almost no free inodes`,
      detail: `${root ? "The root partition (/) " : `The partition at ${mount} `}has ${use}% of its inodes in use. New files cannot be created even though disk space may still be free — this is the classic cause of "No space left on device" with free space showing in df -h.`,
      evidence,
      fix: `Find what is eating inodes with \`sudo find ${mount} -xdev -type f | cut -d/ -f3 | sort | uniq -c | sort -rn | head -20\` (many tiny files — caches, logs, mail). Clean the culprit and re-run.`,
      confidence: "high",
    });
  }
  if (use >= t.inodeWarnPct) {
    return finding({
      severity: "medium",
      code: "inodes/full",
      dedupeKey: `inodes:${device}`,
      title: `${label} is getting low on inodes`,
      detail: `${root ? "The root partition (/) " : `The partition at ${mount} `}has ${use}% of its inodes in use. It is not urgent yet, but worth cleaning up before it blocks writes.`,
      evidence,
      fix: `Check \`sudo find ${mount} -xdev -type f | cut -d/ -f3 | sort | uniq -c | sort -rn | head -20\` and clean caches/logs with many small files.`,
      confidence: "high",
    });
  }
  return null;
}

export const inodes = defineCheck({
  id: "inodes",
  title: "Inode usage",
  category: "system",
  async run(ctx) {
    const findings = [];
    const t = ctx.thresholds;
    const res = await ctx.run("df -iP --exclude-type=tmpfs --exclude-type=devtmpfs --exclude-type=squashfs --exclude-type=overlay --exclude-type=proc --exclude-type=sysfs --exclude-type=cgroup2 2>/dev/null");
    if (!res.ok) return findings;

    for (const l of lines(res.stdout).slice(1)) {
      const p = l.split(/\s+/);
      if (p.length < 6) continue;
      const mount = p[5];
      // Same AppImage exemption as disk.js: FUSE runtime mounts at
      // /tmp/.mount_* (device *.AppImage) always read 100% by design.
      if (p[0].includes(".AppImage") || mount.includes("/.mount_")) continue;
      const use = pct(p[4]);
      if (use <= 0 || mount === "/") continue;
      // --exclude-type already filters pseudo filesystems; the extra
      // EXCLUDED_FS check is intentionally device-based (for tmpfs/overlay
      // the device name equals the type) and only kept for root below.
      // Non-root relies on df's --exclude-type alone, like disk.js.
      const f = inodeFinding({ mount, use, evidence: l, t, device: p[0] });
      if (f) findings.push(f);
    }

    const rootLine = lines(res.stdout).find((l) => l.split(/\s+/)[5] === "/");
    if (rootLine) {
      const p = rootLine.split(/\s+/);
      const fs = p[0];
      const isVirtualRoot = fs.includes("composefs") || fs.includes("ostree") || EXCLUDED_FS.has(fs);
      if (!isVirtualRoot) {
        const f = inodeFinding({ mount: "/", use: pct(p[4]), evidence: rootLine, root: true, t, device: p[0] });
        if (f) findings.push(f);
      }
    }
    return findings;
  },
});
