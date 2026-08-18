import { lines, num, plural } from "../utils.js";
import { readCache, writeCache } from "../cache.js";

/**
 * Counts pending updates using the distro's package manager.
 * Only read-only commands are used (check-update / simulation).
 * The distro → package-manager mapping lives in src/distro.js; this check
 * only picks the command for the profile it is given.
 *
 * Refreshing dnf metadata is the single slowest thing in a full run (~5s), so
 * the result is cached for 30 minutes (override LINUX_DOCTOR_UPDATES_TTL_MS;
 * 0 disables the cache). The TTL is read at call time so tests can control it.
 */
import { defineCheck } from "./define.js";

const UPDATES_CACHE_MS = 30 * 60 * 1000;

export const updates = defineCheck({
  id: "updates",
  title: "Pending updates",
  category: "updates",
  async run(ctx) {
    const findings = [];
    const { pkg, id: distroId, family } = ctx.dist;

    const ttlMs = Number(process.env.LINUX_DOCTOR_UPDATES_TTL_MS || UPDATES_CACHE_MS);
    const useCache = Number.isFinite(ttlMs) && ttlMs > 0;
    if (useCache) {
      const cached = readCache("updates", ttlMs);
      if (cached) return cached;
    }

    let cmd = null;
    let label = "";
    if (pkg === "rpm-ostree") {
      cmd = "rpm-ostree upgrade --check 2>&1";
      label = "rpm-ostree";
    } else if (pkg === "dnf") {
      cmd = "dnf check-update --quiet 2>/dev/null";
      label = "dnf";
    } else if (pkg === "apt") {
      // 2>&1 so apt's failure messages (dpkg lock, E: ...) are visible — a
      // locked or broken apt must NOT look like "0 updates".
      cmd = "apt-get -s upgrade 2>&1";
      label = "apt";
    } else if (pkg === "zypper") {
      cmd = "zypper -q lu 2>/dev/null | awk 'NR>4 && NF' | wc -l";
      label = "zypper";
    } else if (pkg === "apk") {
      cmd = "apk info -u 2>/dev/null";
      label = "apk";
    } else if (pkg === "pacman") {
      cmd = "checkupdates 2>/dev/null || pacman -Qu 2>/dev/null";
      label = "pacman";
    }

    if (!cmd) {
      findings.push({
        severity: "info",
        code: "updates/skipped",
        title: "Update check skipped",
        detail: `No update check exists for this distro family ("${distroId || "unknown"}", family "${family}").`,
        evidence: null,
        fix: null,
        confidence: "medium",
      });
      if (useCache) writeCache("updates", findings);
      return findings;
    }

    const res = await ctx.run(cmd, { timeoutMs: label === "rpm-ostree" ? 30000 : 20000 });
    if (res.missing) {
      findings.push({
        severity: "info",
        code: "updates/skipped",
        title: "Update check skipped",
        detail: `The package manager (${label}) is not installed on this system, so pending updates could not be checked.`,
        evidence: `${label}: not found`,
        fix: null,
        confidence: "high",
      });
      if (useCache) writeCache("updates", findings);
      return findings;
    }
    // dnf exits with 100 when updates are available (0 = up to date);
    // rpm-ostree exits 77 even on a successful check. Any other failure means
    // we could not determine the state, so stay silent instead of falsely
    // reporting "up to date". apt simulation reports errors as text even on a
    // zero exit code, so scan for those too.
    const aptError = label === "apt" && /could not get lock|^E:|^dpkg:|apt-get: error/i.test(res.stdout);
    const ok =
      (res.ok ||
      (label === "dnf" && res.code === 100) ||
      (label === "rpm-ostree" && /Available update:|No updates available\./.test(res.stdout))) &&
      !aptError;
    // Only cache a *successful* determination. A failed command is not
    // cached, so the next run retries instead of repeating a stale result.
    if (!ok) return findings;

    let count;
    if (label === "apt") {
      count = lines(res.stdout).filter((l) => /^Inst /i.test(l)).length;
    } else if (label === "zypper") {
      // These commands print a single count number, not one line per package.
      count = num(lines(res.stdout)[0]);
    } else if (label === "rpm-ostree") {
      // Image updates are atomic: either a new image is available or not.
      count = /Available update:/.test(res.stdout) ? 1 : 0;
    } else {
      count = lines(res.stdout).filter((l) => l !== "0").length;
    }

    const fixCmd = label === "apt" ? "apt upgrade" : label === "pacman" ? "pacman -Syu" : label === "rpm-ostree" ? "rpm-ostree upgrade" : label === "zypper" ? "zypper update" : label === "apk" ? "apk upgrade" : "dnf upgrade";
    const rebootNote = label === "rpm-ostree" ? " Reboot to activate it." : "";

    if (count === 0) {
      findings.push({
        severity: "info",
        code: "updates/none",
        title: "System is up to date",
        detail: `No pending updates found via ${label}.`,
        evidence: `${label}: 0 updates`,
        fix: null,
        confidence: "high",
      });
    } else if (count <= 10) {
      findings.push({
        severity: "info",
        code: "updates/pending",
        title: `${plural(count, "update")} available`,
        detail: `There ${count === 1 ? "is" : "are"} ${count} package update${count > 1 ? "s" : ""} waiting. Updating regularly keeps security fixes current.`,
        evidence: `${label}: ${count} pending`,
        fix: `Apply ${count === 1 ? "it" : "them"} with: \`sudo ${fixCmd}\`${rebootNote}`,
        confidence: "high",
      });
    } else {
      findings.push({
        severity: "medium",
        code: "updates/pending",
        title: `${count} updates available`,
        detail: `There are ${count} package updates waiting. A large backlog means security fixes are also pending.`,
        evidence: `${label}: ${count} pending`,
        fix: `Apply them with: \`sudo ${fixCmd}\`${rebootNote}`,
        confidence: "high",
      });
    }
    if (useCache) writeCache("updates", findings);
    return findings;
  },
});
