import { lines } from "../../utils.js";

import { defineCheck } from "../define.js";
import { finding } from "../../findings.js";

/**
 * Container network health. A container bridge that is DOWN means containers
 * lose their network entirely — and it fails silently (the container still
 * starts). Read-only.
 */
export const connets = defineCheck({
  id: "connets",
  title: "Container network health",
  category: "network",
  premium: true,
  async run(ctx) {
    const findings = [];
    const runtime = await ctx.run("command -v podman >/dev/null 2>&1 && echo podman || command -v docker >/dev/null 2>&1 && echo docker");
    if (!runtime.ok || !runtime.stdout.trim()) return findings; // no container runtime

    const bridges = await ctx.run("ip -br link show type bridge 2>/dev/null");
    if (!bridges.ok || !bridges.stdout.trim()) return findings; // no bridges at all

    const all = lines(bridges.stdout);
    const down = all.filter((l) => /DOWN/.test(l));
    const up = all.filter((l) => /UP/.test(l));

    if (down.length > 0) {
      findings.push(finding({
        severity: "high",
        code: "connets/down",
        title: "A container bridge is down",
        detail: `The bridge(s) ${down.map((l) => l.split(/\s+/)[0]).join(", ")} are DOWN. Containers attached to them have no network — they will start but cannot reach the network or each other.`,
        evidence: bridges.stdout.trim(),
        fix: "Restart the container runtime: `sudo systemctl restart podman` (or `docker`) — it recreates its bridges. Check `journalctl -u podman -u docker` for the reason it went down (often a stale netfilter rule after an unclean shutdown).",
        confidence: "medium",
      }));
    } else if (up.length > 0) {
      findings.push(finding({
        severity: "info",
        code: "connets/ok",
        title: "Container networking is healthy",
        detail: `${runtime.stdout.trim()} is running with ${up.length} bridge network${up.length === 1 ? "" : "s"} up: ${up.map((l) => l.split(/\s+/)[0]).join(", ")}.`,
        evidence: bridges.stdout.trim(),
        fix: null,
        confidence: "high",
      }));
    }
    return findings;
  },
});