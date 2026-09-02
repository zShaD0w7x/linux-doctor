import { lines, shq } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Software RAID health: mdadm arrays (parsed from /proc/mdstat, no binary
 * required) and ZFS pools (via `zpool`). Read-only. A degraded array is a
 * data-loss risk; a rebuilding array is recoverable but has no redundancy until
 * it finishes. Servers run RAID far more often than desktops, so this check is
 * server-scoped — pass `--check=raid` to force it anywhere.
 */
export const raid = defineCheck({
  id: "raid",
  title: "RAID array health",
  category: "storage",
  appliesTo: ["server"],
  async run(ctx) {
    const findings = [];
    const degraded = [];
    const rebuilding = [];
    let mdArrays = 0;
    let zpools = 0;

    // --- mdadm arrays (parsed from /proc/mdstat, no binary required) ---
    const mdstat = await ctx.run("cat /proc/mdstat 2>/dev/null");
    if (mdstat.ok && mdstat.stdout.trim()) {
      const arrays = [];
      let cur = null;
      for (const l of lines(mdstat.stdout)) {
        const head = l.match(/^(md\d+)\s*:\s*(\S+)\s+(raid\S+)/);
        if (head) {
          if (cur) arrays.push(cur);
          cur = { name: head[1], degraded: false, recovery: false };
          continue;
        }
        if (!cur) continue;
        if (/\(F\)/.test(l)) cur.degraded = true;
        const blk = l.match(/\[\d+\/\d+\]\s*\[([U_]+)\]/);
        if (blk && blk[1].includes("_")) cur.degraded = true;
        if (/recovery|resync|reshape|check =/.test(l) && /%/.test(l)) cur.recovery = true;
      }
      if (cur) arrays.push(cur);
      mdArrays = arrays.length;
      for (const a of arrays) {
        if (a.degraded) degraded.push(a.name);
        else if (a.recovery) rebuilding.push(a.name);
      }
    }

    // --- ZFS pools (needs the zpool binary) ---
    const zpoolBin = await ctx.run("command -v zpool 2>/dev/null");
    if (zpoolBin.ok && zpoolBin.stdout.trim()) {
      const list = await ctx.run("zpool list -H -o name 2>/dev/null");
      if (list.ok && list.stdout.trim()) {
        for (const pool of lines(list.stdout)) {
          zpools += 1;
          const st = await ctx.run(`zpool status ${shq(pool)} 2>/dev/null`);
          if (!st.ok) continue;
          const state = (st.stdout.match(/^\s*state:\s*(\S+)/im) || [])[1] || "";
          if (/degraded/i.test(state)) degraded.push(`zpool:${pool}`);
          else if (/resilver|scrub in progress/i.test(st.stdout)) rebuilding.push(`zpool:${pool}`);
        }
      }
    }

    if (degraded.length > 0) {
      const isZfs = degraded.some((d) => d.startsWith("zpool:"));
      findings.push(finding({
        severity: "high",
        code: "raid/degraded",
        title: `${degraded.length} RAID array${degraded.length > 1 ? "s" : ""} degraded`,
        detail: `These arrays are running degraded (a member disk has failed or dropped out): ${degraded.join(", ")}. A degraded array keeps working only because of redundancy — losing one more disk means data loss.`,
        evidence: degraded.join("\n"),
        fix: isZfs
          ? "Inspect the pool with `zpool status` and replace the faulted disk with `zpool replace <pool> <old> <new>`."
          : "Inspect with `cat /proc/mdstat` and `mdadm --detail <array>`; replace the failed disk and re-add it with `mdadm <array> -a <device>`.",
        confidence: "high",
      }));
    } else if (rebuilding.length > 0) {
      findings.push(finding({
        severity: "medium",
        code: "raid/rebuilding",
        title: `${rebuilding.length} RAID array${rebuilding.length > 1 ? "s" : ""} rebuilding`,
        detail: `These arrays are resyncing or scrubbing: ${rebuilding.join(", ")}. This is normal after a disk swap or a scheduled scrub, but the array has no redundancy until it finishes — don't lose another disk in the meantime.`,
        evidence: rebuilding.join("\n"),
        fix: "Monitor progress with `cat /proc/mdstat` (mdadm) or `zpool status` (ZFS). No action is needed unless it stalls.",
        confidence: "high",
      }));
    } else if (mdArrays > 0 || zpools > 0) {
      findings.push(finding({
        severity: "info",
        code: "raid/ok",
        title: "RAID arrays are healthy",
        detail: `${mdArrays + zpools} RAID array${mdArrays + zpools > 1 ? "s" : ""} ${mdArrays + zpools > 1 ? "are" : "is"} online and not degraded.`,
        evidence: `${mdArrays} mdadm, ${zpools} zpool`,
        fix: null,
        confidence: "high",
      }));
    }
    return findings;
  },
});
