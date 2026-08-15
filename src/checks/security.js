import { lines } from "../utils.js";

export const security = {
  id: "security",
  title: "Basic security posture",
  async run(ctx) {
    const findings = [];

    const [firewalld, ufw, nft] = await Promise.all([ctx.run("systemctl is-active firewalld 2>/dev/null"), ctx.run("systemctl is-active ufw 2>/dev/null"), ctx.run("nft list ruleset 2>/dev/null | head -5"),
    ]);
    const firewallActive =
      firewalld.stdout.trim() === "active" ||
      ufw.stdout.trim() === "active" ||
      (nft.ok && nft.stdout.trim().length > 0);

    if (firewallActive) {
      findings.push({
        severity: "info",
        title: "Firewall is active",
        detail: "A firewall is running, which is the recommended baseline for a desktop system.",
        evidence: firewalld.stdout.trim() || ufw.stdout.trim() || "nftables rules present",
        fix: null,
        confidence: "high",
      });
    } else {
      findings.push({
        severity: "medium",
        title: "No active firewall detected",
        detail: "We could not detect an active firewall (firewalld, ufw, or nftables). On many distros the firewall is off by default, which is fine on a trusted home network but risky on public Wi-Fi.",
        evidence: "firewalld/ufw inactive, no nftables rules",
        fix: "Enable one: `sudo systemctl enable --now firewalld` (Fedora-family) or `sudo ufw enable` (Debian-family).",
        confidence: "medium",
      });
    }

    const selinux = await ctx.run("getenforce 2>/dev/null");
    if (selinux.ok && selinux.stdout.trim() === "Enforcing") {
      findings.push({
        severity: "info",
        title: "SELinux is enforcing",
        detail: "SELinux is running in enforcing mode. Occasional SELinux messages in the log are normal and usually harmless.",
        evidence: "getenforce: Enforcing",
        fix: null,
        confidence: "high",
      });
    }

    const upRes = await ctx.run("systemctl is-active packagekit 2>/dev/null || systemctl is-active dnf-makecache 2>/dev/null");
    // Updates are checked by the dedicated "updates" check; here we just report
    // whether an automatic update service is active.
    if (upRes.ok && upRes.stdout.trim() === "active") {
      findings.push({
        severity: "info",
        title: "Automatic update service is active",
        detail: "A package update service is running, so security updates are likely to arrive automatically.",
        evidence: upRes.stdout.trim(),
        fix: null,
        confidence: "medium",
      });
    }
    return findings;
  },
};
