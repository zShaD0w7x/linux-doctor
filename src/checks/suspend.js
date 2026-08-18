import { lines } from "../utils.js";

import { defineCheck } from "./define.js";

export const suspend = defineCheck({
  id: "suspend",
  title: "Suspend / resume",
  category: "software",
  appliesTo: ["desktop", "laptop"],
  async run(ctx) {
    const findings = [];
    // journalctl -g prints "-- Boot ... --" separators for every boot in the
    // window even when nothing matches, so without the filter this check would
    // report a failure on any system that booted more than once in 7 days.
    const res = await ctx.run(`journalctl -g "system-sleep.*failed" --since "-7 days" --no-pager -o short 2>/dev/null | grep -v "^-- "`);
    if (!res.ok || !res.stdout.trim()) return findings;

    const entries = lines(res.stdout).slice(-5);
    findings.push({
      severity: "medium",
      code: "suspend/failed",
      title: "Suspend hooks are failing",
      detail: "Some scripts that run when the system suspends or wakes up are failing. On laptops this usually means fan control, power management, or driver setup does not re-apply after waking up.",
      evidence: entries.join("\n"),
      fix: "Look at the failing hook name in the log above, then check its config or remove it with `sudo rm /usr/lib/systemd/system-sleep/<hook>` if you do not need it.",
      confidence: "high",
      // Shared with the journal check's deferred system-sleep lines: if that
      // finding ever reappears, dedupe() keeps this specialized one.
      dedupeKey: "system-sleep-hooks",
    });
    return findings;
  },
});
