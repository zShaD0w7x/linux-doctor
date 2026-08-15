import { lines } from "../utils.js";

export const services = {
  id: "services",
  title: "Failed services",
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
        title: `${failed.length} service${failed.length > 1 ? "s" : ""} failed to start`,
        detail: `These ${failed.length} service(s) are in a failed state: ${failed.map((f) => `\`${f.name}\` (${f.scope})`).join(", ")}. A failed service usually means a broken package, a bad configuration, or a hook that errored.`,
        evidence: failed.map((f) => `${f.name}\t${f.scope}`).join("\n"),
        fix: `Inspect one with \`systemctl status ${failed[0].name}\` (or \`systemctl --user status ${failed[0].name}\` for user services). If it is not something you need, disable it with \`systemctl disable ${failed[0].name}\`.`,
        confidence: "high",
      });
    }
    return findings;
  },
};
