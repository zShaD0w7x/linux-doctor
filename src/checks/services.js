import { lines, plural } from "../utils.js";

import { defineCheck } from "./define.js";

export const services = defineCheck({
  id: "services",
  title: "Failed services",
  category: "software",
  async run(ctx) {
    const findings = [];
    const [sys, user] = await Promise.all([
      ctx.run("systemctl --failed --no-legend --plain"),
      ctx.run("systemctl --user --failed --no-legend --plain"),
    ]);

    const failed = [];
    for (const [res, scope] of [[sys, "system"], [user, "user"]]) {
      if (!res.ok) continue;
      for (const l of lines(res.stdout)) {
        const name = l.split(/\s+/)[0];
        if (name) failed.push({ name, scope });
      }
    }

    if (failed.length > 0) {
      findings.push({
        severity: failed.length > 2 ? "high" : "medium",
        code: "services/failed",
        title: `${failed.length} service${failed.length > 1 ? "s" : ""} failed to start`,
        detail: `These ${plural(failed.length, "service")} are in a failed state: ${failed.map((f) => `\`${f.name}\` (${f.scope})`).join(", ")}. A failed service usually means a broken package, a bad configuration, or a hook that errored.`,
        evidence: failed.map((f) => `${f.name}\t${f.scope}`).join("\n"),
        fix: `Inspect one with \`systemctl status ${failed[0].name}\` (or \`systemctl --user status ${failed[0].name}\` for user services). If it is not something you need, disable it with \`systemctl disable ${failed[0].name}\`.`,
        confidence: "high",
      });
    } else if (sys.missing && user.missing) {
      // Non-systemd distros (Alpine/OpenRC, Void/runit, Gentoo/OpenRC) have no
      // systemctl; say so instead of silently skipping.
      const init = await ctx.run("ps -p 1 -o comm= 2>/dev/null");
      findings.push({
        severity: "info",
        title: "Non-systemd system — services check skipped",
        detail: `This system does not run systemd (init: ${init.stdout.trim() || "unknown"}), so the failed-services check does not apply.`,
        evidence: init.stdout.trim() || "init unknown",
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
});
