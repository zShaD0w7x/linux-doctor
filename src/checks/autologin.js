// SPDX-License-Identifier: GPL-3.0-or-later
import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Automatic login detection. Greps the common display-manager configs for
 * autologin settings — read-only and distro-agnostic.
 *
 * The grep is deliberately wide and the decision is made here, because the raw
 * matches include three things that are not autologin:
 *   - commented examples ("# AutomaticLoginEnable=true"), which ship in the
 *     default GDM config on several distros;
 *   - an explicit disable ("AutomaticLoginEnable=false"), which says the
 *     opposite of what the old bare match reported;
 *   - a bare "[Autologin]" section header, which sets nothing on its own.
 * A section header only counts once a User= line follows it, and GDM only
 * autologins when AutomaticLoginEnable is true.
 *
 * Both GDM layouts are searched: Fedora/RHEL/openSUSE keep their config in
 * /etc/gdm/custom.conf, while Debian/Ubuntu/Mint use /etc/gdm3 (the file there
 * is daemon.conf, which `grep -r` reaches). Listing only /etc/gdm meant an
 * enabled autologin on the Debian family was never read at all.
 */
const AUTOLOGIN_GREP =
  "grep -rEn 'AutomaticLoginEnable|AutologinUser|autologin-user|\\[Autologin\\]|^[[:space:]]*User[[:space:]]*=' /etc/gdm /etc/gdm3 /etc/sddm.conf /etc/sddm.conf.d/ /etc/lightdm/ /etc/lxdm/ 2>/dev/null";

export const autologin = defineCheck({
  id: "autologin",
  title: "Automatic login",
  category: "security",
  async run(ctx) {
    const findings = [];

    const res = await ctx.run(AUTOLOGIN_GREP);
    const sections = new Map(); // file -> last section header seen
    const enabled = [];

    for (const line of lines(res.stdout)) {
      if (line.includes("Binary file")) continue;
      const parts = line.match(/^([^:]+):\d+:(.*)$/);
      if (!parts) continue;
      const [, file, raw] = parts;
      const content = raw.trim();
      if (content === "" || content.startsWith("#") || content.startsWith(";")) continue;

      const header = content.match(/^\[([^\]]+)\]/);
      if (header) {
        sections.set(file, header[1].toLowerCase());
        continue;
      }

      const truthy = /^AutomaticLoginEnable\s*=\s*(?:true|yes|1)\s*$/i.test(content);
      const username = /^(?:AutologinUser|autologin-user)\s*=\s*\S+/i.test(content);
      const sddmUser = /^User\s*=\s*\S+/i.test(content) && sections.get(file) === "autologin";
      if (truthy || username || sddmUser) enabled.push(line.trim());
    }

    if (enabled.length === 0) return findings;

    findings.push(finding({
      severity: "medium",
      code: "security/autologin",
      title: "Automatic login is enabled",
      detail: "The desktop logs in without a password, so anyone with physical access to this machine gets a logged-in session.",
      evidence: enabled[0],
      fix: "Turn it off in your display manager's settings (e.g. AutomaticLoginEnable in /etc/gdm/custom.conf, or Autologin in /etc/sddm.conf) and lock the screen on suspend.",
      confidence: "high",
    }));
    return findings;
  },
});