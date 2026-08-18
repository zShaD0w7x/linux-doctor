import { lines, plural } from "../utils.js";

/**
 * Scheduled tasks (systemd timers). The classic silent failure is a timer
 * that is enabled but never fires — backups "just stop". We look for enabled
 * timers with no last run and no next elapse, which means the schedule is
 * broken; disabled timers also show n/a and are explicitly excluded via
 * `systemctl is-enabled`. Reads only.
 */
import { defineCheck } from "./define.js";

export const timers = defineCheck({
  id: "timers",
  title: "Scheduled tasks (systemd timers)",
  category: "software",
  async run(ctx) {
    const findings = [];

    const res = await ctx.run("systemctl list-timers --all --no-pager --plain 2>/dev/null");
    if (res.missing || !res.ok) return findings; // non-systemd — nothing to check

    const raw = lines(res.stdout);
    if (raw.length < 2) return findings;

    // Column start offsets come from the header line: systemd pads the header
    // and the rows to the same fixed widths, so slicing beats splitting on
    // whitespace (a short PASSED value like "-" glues itself to UNIT with a
    // single space and would shift every column after it).
    const offsets = [];
    for (const m of raw[0].matchAll(/\S+/g)) offsets.push(m.index);
    if (offsets.length < 6) return findings; // unexpected layout — stay silent
    const col = (row, i) => (i + 1 < offsets.length ? row.slice(offsets[i], offsets[i + 1]) : row.slice(offsets[i])).trim();

    // Missing values print as "-" (or "n/a" on some systemd versions).
    const missing = /^(?:n\/a|-)$/;
    const broken = [];
    for (const l of raw.slice(1)) {
      const unit = col(l, 4);
      if (!unit.endsWith(".timer")) continue;
      if (!missing.test(col(l, 0)) || !missing.test(col(l, 2))) continue;
      // Enabled but never fired and not scheduled = broken schedule.
      // (Disabled timers also show "-" and are perfectly fine.)
      const en = await ctx.run(`systemctl is-enabled ${unit} 2>/dev/null`);
      if (en.ok && en.stdout.trim() === "enabled") broken.push(unit);
    }

    if (broken.length > 0) {
      findings.push({
        severity: "medium",
        code: "timers/broken",
        title: `${plural(broken.length, "scheduled task")} enabled but never running`,
        detail: `These timers are enabled but have never fired and are not scheduled to run: ${broken.map((u) => `\`${u}\``).join(", ")}. A timer in this state silently never runs — a common reason backups \"just stop\".`,
        evidence: broken.join("\n"),
        fix: `Inspect one with \`systemctl status ${broken[0]}\` and \`journalctl -u ${broken[0]} -b\`, then re-arm it with \`sudo systemctl restart ${broken[0]}\` (use \`systemctl --user ...\` for user timers).`,
        confidence: "medium",
      });
    } else {
      findings.push({
        severity: "info",
        code: "timers/ok",
        title: "Scheduled tasks look healthy",
        detail: "All enabled timers are scheduled to run.",
        evidence: `${plural(raw.length - 2, "timer")} listed`,
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
});
