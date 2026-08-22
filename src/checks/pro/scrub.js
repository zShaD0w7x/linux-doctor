import { lines, shq } from "../../utils.js";

import { defineCheck } from "../define.js";
import { finding } from "../../findings.js";

const MAX_SCRUB_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Find a Date.parse-able timestamp in a line like "… on Fri Jul 10 08:15:00 2026". */
function findDate(text) {
  const m = String(text).match(/([A-Z][a-z]{2} \w{3} \d{1,2} \d{2}:\d{2}:\d{2} \d{4})/);
  if (!m) return null;
  const t = Date.parse(m[1]);
  return Number.isFinite(t) ? t : null;
}

/**
 * Data-integrity scrub age for ZFS and Btrfs. Scrubs find silent bit rot early;
 * a filesystem that has never been scrubbed (or hasn't been in months) is a
 * data-loss risk that most users never think about. Read-only.
 */
export const scrub = defineCheck({
  id: "scrub",
  title: "Filesystem scrub age (ZFS/Btrfs)",
  category: "data",
  premium: true,
  async run(ctx) {
    const findings = [];
    const stale = [];
    const ok = [];

    const zpool = await ctx.run("zpool status 2>/dev/null");
    if (zpool.ok && zpool.stdout.trim()) {
      for (const l of lines(zpool.stdout)) {
        if (!/scan:/.test(l)) continue;
        if (/none requested/i.test(l)) {
          stale.push("a ZFS pool has never been scrubbed");
          continue;
        }
        const t = findDate(l);
        if (t === null || Date.now() - t > MAX_SCRUB_AGE_MS) stale.push(`a ZFS pool was last scrubbed more than 30 days ago`);
        else ok.push("ZFS pools are scrubbed recently");
      }
    }

    const mounts = await ctx.run("findmnt -t btrfs -o TARGET -n 2>/dev/null");
    for (const target of lines(mounts.stdout)) {
      if (target === "/var/lib/docker" || target.includes("/snap/")) continue; // auto-created subvolumes
      const res = await ctx.run(`btrfs scrub status ${shq(target)} 2>/dev/null | grep -i "started at"`);
      if (!res.ok || !res.stdout.trim()) continue;
      const t = findDate(res.stdout);
      if (t === null || Date.now() - t > MAX_SCRUB_AGE_MS) stale.push(`${target} was last scrubbed more than 30 days ago`);
      else ok.push(`${target} is scrubbed recently`);
    }

    if (stale.length === 0 && ok.length === 0) return findings; // no ZFS/Btrfs on this system

    if (stale.length > 0) {
      findings.push(finding({
        severity: "medium",
        code: "scrub/stale",
        title: "Filesystem scrub is overdue",
        detail: `Bit rot (silent data corruption) is only found by scrubbing. ${stale.join("; ")}. Scrub regularly so corrupt blocks are repaired before they are ever read.`,
        evidence: stale.join("\n"),
        fix: "Run `sudo zpool scrub <pool>` or `sudo btrfs scrub start <mount>` now, then schedule it monthly (a systemd timer or cron). Scrubs run in the background and are safe on a live system.",
        confidence: "high",
      }));
    } else {
      findings.push(finding({
        severity: "info",
        code: "scrub/ok",
        title: "Filesystem scrub is up to date",
        detail: ok.join("; "),
        evidence: ok.join("\n"),
        fix: null,
        confidence: "high",
      }));
    }
    return findings;
  },
});