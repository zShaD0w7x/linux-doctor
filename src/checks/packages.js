import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Package manager health — detects a broken/locked package system that
 * makes `updates` lie ("up to date" when apt/dnf is actually blocked).
 * Checks dpkg audit, apt lock, and dnf/rpm DB. Read-only.
 */
export const packages = defineCheck({
  id: "packages",
  title: "Package manager health",
  category: "system",
  async run(ctx) {
    const findings = [];
    const { pkg, family } = ctx.dist || {};

    // Debian/Ubuntu family
    if (pkg === "apt" || family === "debian") {
      const [dpkgAudit, aptCheck, lockRes] = await Promise.all([
        ctx.run("dpkg --audit 2>&1 | head -20"),
        ctx.run("apt-get check 2>&1 | head -20"),
        ctx.run("ls /var/lib/dpkg/lock* /var/lib/apt/lists/lock 2>/dev/null; fuser /var/lib/dpkg/lock 2>/dev/null | head -1"),
      ]);

      const auditOut = (dpkgAudit.stdout || "").trim();
      const checkOut = (aptCheck.stdout || "").trim();
      const hasAudit = auditOut !== "" && !/no packages/i.test(auditOut);
      const hasCheckError = /E:|error|broken|unmet dependencies/i.test(checkOut);

      if (hasAudit) {
        findings.push(finding({
          severity: "high",
          code: "packages/broken",
          title: "Package database has broken packages",
          detail: "`dpkg --audit` reports packages in a broken state. Updates and installs will fail until this is fixed.",
          evidence: lines(auditOut).slice(0, 3).join("\n"),
          fix: "Fix with `sudo dpkg --configure -a` then `sudo apt --fix-broken install`.",
          confidence: "high",
        }));
        return findings;
      }

      if (hasCheckError) {
        findings.push(finding({
          severity: "high",
          code: "packages/broken",
          title: "Package manager reports broken dependencies",
          detail: "`apt-get check` reports broken packages or unmet dependencies.",
          evidence: lines(checkOut).slice(0, 3).join("\n"),
          fix: "Fix with `sudo apt --fix-broken install` and `sudo apt update`.",
          confidence: "high",
        }));
        return findings;
      }

      // Lock file present + held by another process = apt is busy/locked
      if (lockRes.ok && lockRes.stdout.trim() !== "") {
        const fuserOut = lines(lockRes.stdout).join(" ").trim();
        // Only flag as locked if fuser shows a PID (actually held)
        if (/\d/.test(fuserOut)) {
          findings.push(finding({
            severity: "medium",
            code: "packages/locked",
            title: "Package manager is locked by another process",
            detail: "Another apt/dpkg process is holding the package lock. Updates cannot run until it finishes.",
            evidence: `lock held by PID ${fuserOut}`,
            fix: "Wait for the other apt process to finish, or if it is stuck, check `ps aux | grep -E 'apt|dpkg'` and close it.",
            confidence: "medium",
          }));
          return findings;
        }
      }

      // Check for dpkg interrupted flag
      const interrupted = await ctx.run("test -f /var/lib/dpkg/updates/tmp.i 2>/dev/null && echo interrupted; dpkg --audit 2>&1 | grep -q 'half-installed\\|unpacked' && echo half");
      if (interrupted.ok && interrupted.stdout.trim() !== "") {
        findings.push(finding({
          severity: "high",
          code: "packages/broken",
          title: "Package manager was interrupted",
          detail: "A previous apt/dpkg run was interrupted and left packages half-installed.",
          evidence: "dpkg: half-installed / unpacked packages found",
          fix: "Fix with `sudo dpkg --configure -a` then `sudo apt --fix-broken install`.",
          confidence: "high",
        }));
        return findings;
      }

      // Healthy — only claim it when we actually saw the data source
      if (!dpkgAudit.ok && !aptCheck.ok && !lockRes.ok) return findings;
      findings.push(finding({
        severity: "info",
        code: "packages/ok",
        title: "Package manager is healthy",
        detail: "No broken packages or locks were found. apt/dpkg is ready for updates.",
        evidence: "dpkg --audit: clean · apt-get check: ok",
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    // Fedora/RHEL family — check rpm DB and dnf
    if (pkg === "dnf" || family === "fedora") {
      const [rpmCheck, dnfCheck] = await Promise.all([
        ctx.run("rpm --verify --all 2>&1 | head -5; rpm -Va 2>&1 | head -5"),
        ctx.run("dnf check 2>&1 | head -20"),
      ]);

      const dnfOut = (dnfCheck.stdout || "").toLowerCase();
      if (/error|broken|conflict|missing dependency/i.test(dnfOut) && dnfOut.trim() !== "") {
        findings.push(finding({
          severity: "high",
          code: "packages/broken",
          title: "Package manager reports problems",
          detail: "`dnf check` reports package problems that may block updates.",
          evidence: lines(dnfCheck.stdout).slice(0, 3).join("\n"),
          fix: "Check `sudo dnf check` and `sudo dnf distro-sync --assumeno` to see details.",
          confidence: "medium",
        }));
        return findings;
      }

      if (!dnfCheck.ok) return findings;
      findings.push(finding({
        severity: "info",
        code: "packages/ok",
        title: "Package manager is healthy",
        detail: "No package problems were found. dnf/rpm is ready for updates.",
        evidence: "dnf check: ok",
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    // Arch — check pacman DB
    if (pkg === "pacman" || family === "arch") {
      const pacmanCheck = await ctx.run("pacman -Dk 2>&1 | head -20");
      const out = pacmanCheck.stdout || "";
      if (/error|missing|mismatch/i.test(out) && out.trim() !== "") {
        findings.push(finding({
          severity: "high",
          code: "packages/broken",
          title: "Pacman database has errors",
          detail: "`pacman -Dk` reports database errors.",
          evidence: lines(out).slice(0, 3).join("\n"),
          fix: "Check `pacman -Dk` and `sudo pacman -Syy` to refresh the database.",
          confidence: "high",
        }));
        return findings;
      }
      if (!pacmanCheck.ok) return findings;
      findings.push(finding({
        severity: "info",
        code: "packages/ok",
        title: "Package manager is healthy",
        detail: "Pacman database looks healthy.",
        evidence: "pacman -Dk: ok",
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    // Unknown family — nothing to say
    return findings;
  },
});
