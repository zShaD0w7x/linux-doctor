import { lines, pct, num } from "../utils.js";

/**
 * Real partitions only. We deliberately exclude pseudo-filesystems and the
 * composefs/ostree root on immutable distros (Bazzite, Fedora Atomic, ...),
 * where the root always reports 100% full and that is completely normal.
 */
const EXCLUDED_FS = new Set([
  "tmpfs", "devtmpfs", "squashfs", "overlay", "proc", "sysfs",
  "cgroup2", "efivarfs", "securityfs", "debugfs", "tracefs", "fusectl",
  "devpts", "mqueue", "configfs", "binfmt_misc", "autofs", "ramfs",
  "bpf", "pstore", "hugetlbfs",
]);

export const disk = {
  id: "disk",
  title: "Disk space",
  async run(ctx) {
    const findings = [];
    const res = await ctx.run("df -P -B1 --exclude-type=tmpfs --exclude-type=devtmpfs --exclude-type=squashfs --exclude-type=overlay --exclude-type=proc --exclude-type=sysfs --exclude-type=cgroup2");
    if (!res.ok) return findings;

    for (const l of lines(res.stdout).slice(1)) {
      const p = l.split(/\s+/);
      if (p.length < 6) continue;
      const fs = p[0];
      const mount = p[5];
      const use = pct(p[4]);
      const avail = num(p[3]);
      if (use <= 0 || mount === "/") continue; // root handled separately below
      if (use >= 90) {
        findings.push({
          severity: "high",
          title: `Partition ${mount} is nearly full`,
          detail: `The partition mounted at ${mount} is ${use}% full with only ${Math.round(avail / 1024 ** 3)} GB free. A full disk can slow the system and break updates.`,
          evidence: l,
          fix: "Find large files with `du -xh /path | sort -rh | head -20` and delete or move what you no longer need.",
          confidence: "high",
        });
      } else if (use >= 80) {
        findings.push({
          severity: "medium",
          title: `Partition ${mount} is getting full`,
          detail: `The partition mounted at ${mount} is ${use}% full (${Math.round(avail / 1024 ** 3)} GB free). It is not urgent yet, but it is worth cleaning up.`,
          evidence: l,
          fix: "Run `du -xh /path | sort -rh | head -20` to find the largest files.",
          confidence: "high",
        });
      }
    }

    // Root mount: skip composefs/ostree layers (immutable distros), keep real roots.
    const rootLine = lines(res.stdout).find((l) => l.split(/\s+/)[5] === "/");
    if (rootLine) {
      const p = rootLine.split(/\s+/);
      const fs = p[0];
      const isVirtualRoot = fs.includes("composefs") || fs.includes("ostree") || EXCLUDED_FS.has(fs);
      if (!isVirtualRoot) {
        const use = pct(p[4]);
        const avail = num(p[3]);
        if (use >= 90) {
          findings.push({
            severity: "high",
            title: "Root partition is nearly full",
            detail: `The root partition (/) is ${use}% full with only ${Math.round(avail / 1024 ** 3)} GB free.`,
            evidence: rootLine,
            fix: "Free up space: `sudo journalctl --vacuum-size=500M`, `sudo dnf clean all` or `apt-get clean`, then find large files with `du -xh / | sort -rh | head -20`.",
            confidence: "high",
          });
        } else if (use >= 80) {
          findings.push({
            severity: "medium",
            title: "Root partition is getting full",
            detail: `The root partition (/) is ${use}% full (${Math.round(avail / 1024 ** 3)} GB free).`,
            evidence: rootLine,
            fix: "Check `du -xh / | sort -rh | head -20` and clean up large files or logs.",
            confidence: "high",
          });
        }
      }
    }
    return findings;
  },
};
