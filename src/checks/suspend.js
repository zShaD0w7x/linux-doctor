import { lines } from "../utils.js";

export const suspend = {
  id: "suspend",
  title: "Suspend / resume",
  async run(ctx) {
    const findings = [];
    const res = await ctx.run(`journalctl -g "system-sleep.*failed" --since "-7 days" --no-pager -o short 2>/dev/null`);
    if (!res.ok || !res.stdout.trim()) return findings;

    const entries = lines(res.stdout).slice(-5);
    findings.push({
      severity: "medium",
      title: "Suspend hooks are failing",
      detail: "Some scripts that run when the system suspends or wakes up are failing. On laptops this usually means fan control, power management, or driver setup does not re-apply after waking up.",
      evidence: entries.join("\n"),
      fix: "Look at the failing hook name in the log above, then check its config or remove it with `sudo rm /usr/lib/systemd/system-sleep/<hook>` if you do not need it.",
      confidence: "high",
    });
    return findings;
  },
};
