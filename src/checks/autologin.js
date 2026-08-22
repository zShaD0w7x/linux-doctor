import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Automatic login detection. Greps the common display-manager configs for
 * autologin settings — read-only and distro-agnostic.
 */

export const autologin = defineCheck({
  id: "autologin",
  title: "Automatic login",
  category: "security",
  async run(ctx) {
    const findings = [];

    const res = await ctx.run("grep -rEn 'AutomaticLoginEnable|AutologinUser|Autologin|autologin-user' /etc/gdm /etc/sddm.conf /etc/sddm.conf.d/ /etc/lightdm/ /etc/lxdm/ 2>/dev/null");
    const matches = lines(res.stdout).filter((l) => l.trim() !== "" && !l.includes("Binary file"));
    if (matches.length === 0) return findings;

    findings.push(finding({
      severity: "medium",
      code: "security/autologin",
      title: "Automatic login is enabled",
      detail: "The desktop logs in without a password, so anyone with physical access to this machine gets a logged-in session.",
      evidence: matches[0].trim(),
      fix: "Turn it off in your display manager's settings (e.g. AutomaticLoginEnable in /etc/gdm/custom.conf, or Autologin in /etc/sddm.conf) and lock the screen on suspend.",
      confidence: "high",
    }));
    return findings;
  },
});