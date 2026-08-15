import { lines } from "../utils.js";

/**
 * Counts pending updates using the distro's package manager.
 * Only read-only commands are used (check-update / simulation).
 */
export const updates = {
  id: "updates",
  title: "Pending updates",
  async run(ctx) {
    const findings = [];
    const id = (ctx.osRelease.id || "").toLowerCase();
    const idLike = (ctx.osRelease.id_like || "").toLowerCase();
    const family = `${id} ${idLike}`;

    let cmd = null;
    let label = "";
    if (family.includes("fedora") || family.includes("rhel") || family.includes("centos")) {
      cmd = "dnf check-update --quiet 2>/dev/null";
      label = "dnf";
    } else if (family.includes("debian") || family.includes("ubuntu")) {
      cmd = "apt-get -s upgrade 2>/dev/null | grep -c '^Inst ' || true";
      label = "apt";
    } else if (family.includes("arch")) {
      cmd = "checkupdates 2>/dev/null || pacman -Qu 2>/dev/null";
      label = "pacman";
    }

    if (!cmd) {
      findings.push({
        severity: "info",
        title: "Update check skipped",
        detail: `We do not have an update check for this distro family ("${family.trim()}" or unknown).`,
        evidence: null,
        fix: null,
        confidence: "medium",
      });
      return findings;
    }

    const res = await ctx.run(cmd, { timeoutMs: 20000 });
    if (!res.ok && res.missing) return findings;
    const count = lines(res.stdout).filter((l) => l !== "0").length;

    if (count === 0) {
      findings.push({
        severity: "info",
        title: "System is up to date",
        detail: `No pending updates found via ${label}.`,
        evidence: `${label}: 0 updates`,
        fix: null,
        confidence: "high",
      });
    } else if (count <= 10) {
      findings.push({
        severity: "info",
        title: `${count} update(s) available`,
        detail: `There ${count === 1 ? "is" : "are"} ${count} package update${count > 1 ? "s" : ""} waiting. Updating regularly keeps security fixes current.`,
        evidence: `${label}: ${count} pending`,
        fix: `Apply them with: \`sudo ${label === "apt" ? "apt upgrade" : label === "pacman" ? "pacman -Syu" : "dnf upgrade"}\``,
        confidence: "high",
      });
    } else {
      findings.push({
        severity: "medium",
        title: `${count} updates available`,
        detail: `There are ${count} package updates waiting. A large backlog means security fixes are also pending.`,
        evidence: `${label}: ${count} pending`,
        fix: `Apply them with: \`sudo ${label === "apt" ? "apt upgrade" : label === "pacman" ? "pacman -Syu" : "dnf upgrade"}\``,
        confidence: "high",
      });
    }
    return findings;
  },
};
