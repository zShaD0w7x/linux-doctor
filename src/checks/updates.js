import { lines, num } from "../utils.js";

/**
 * Counts pending updates using the distro's package manager.
 * Only read-only commands are used (check-update / simulation).
 */
export const updates = {
  id: "updates",
  title: "Pending updates",
  async run(ctx) {
    const findings = [];
    // os-release keys are uppercase (ID, ID_LIKE); accept either case so the
    // check works against both real /etc/os-release output and stubs.
    const id = (ctx.osRelease.id || ctx.osRelease.ID || "").toLowerCase();
    const idLike = (ctx.osRelease.id_like || ctx.osRelease.ID_LIKE || "").toLowerCase();
    const family = `${id} ${idLike}`;

    let cmd = null;
    let label = "";
    // Image-based (ostree) distros like Bazzite/Silverblue update atomically via
    // rpm-ostree, not dnf. Must be checked before the plain fedora branch.
    if (family.includes("bazzite") || family.includes("ostree") || family.includes("silverblue") || family.includes("kinoite") || family.includes("atomic")) {
      cmd = "rpm-ostree upgrade --check 2>&1";
      label = "rpm-ostree";
    } else if (family.includes("fedora") || family.includes("rhel") || family.includes("centos")) {
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

    const res = await ctx.run(cmd, { timeoutMs: label === "rpm-ostree" ? 30000 : 20000 });
    if (res.missing) return findings;
    // dnf exits with 100 when updates are available (0 = up to date);
    // rpm-ostree exits 77 even on a successful check. Any other failure means
    // we could not determine the state, so stay silent instead of falsely
    // reporting "up to date".
    const ok =
      res.ok ||
      (label === "dnf" && res.code === 100) ||
      (label === "rpm-ostree" && /Available update:|No updates available\./.test(res.stdout));
    if (!ok) return findings;

    let count;
    if (label === "apt") {
      // `grep -c` prints a single number, not one line per package.
      count = num(lines(res.stdout)[0]);
    } else if (label === "rpm-ostree") {
      // Image updates are atomic: either a new image is available or not.
      count = /Available update:/.test(res.stdout) ? 1 : 0;
    } else {
      count = lines(res.stdout).filter((l) => l !== "0").length;
    }

    const fixCmd = label === "apt" ? "apt upgrade" : label === "pacman" ? "pacman -Syu" : label === "rpm-ostree" ? "rpm-ostree upgrade" : "dnf upgrade";
    const rebootNote = label === "rpm-ostree" ? " Reboot to activate it." : "";

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
        fix: `Apply ${count === 1 ? "it" : "them"} with: \`sudo ${fixCmd}\`${rebootNote}`,
        confidence: "high",
      });
    } else {
      findings.push({
        severity: "medium",
        title: `${count} updates available`,
        detail: `There are ${count} package updates waiting. A large backlog means security fixes are also pending.`,
        evidence: `${label}: ${count} pending`,
        fix: `Apply them with: \`sudo ${fixCmd}\`${rebootNote}`,
        confidence: "high",
      });
    }
    return findings;
  },
};
