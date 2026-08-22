import { lines, shq } from "../../utils.js";

import { defineCheck } from "../define.js";
import { finding } from "../../findings.js";

const HARDENING = [
  { key: "kernel.kptr_restrict", want: "2", why: "hides kernel pointer addresses from unprivileged users" },
  { key: "kernel.dmesg_restrict", want: "1", why: "only root can read the kernel log buffer" },
  { key: "kernel.perf_event_paranoid", want: "3", why: "only root can collect performance events" },
  { key: "kernel.unprivileged_bpf_disabled", want: "1", why: "blocks unprivileged BPF programs" },
  { key: "net.ipv4.conf.all.rp_filter", want: "1", why: "reverse-path filtering against spoofed packets (1 or 2 both enable it)" },
  { key: "net.ipv4.tcp_syncookies", want: "1", why: "SYN-flood protection" },
];

const isSatisfied = (value, item) =>
  item.key.includes("rp_filter") ? value === "1" || value === "2" : value === item.want;

/**
 * Kernel hardening audit. Sysctl settings that materially reduce the attack
 * surface; a default distro install often leaves several off. Read-only.
 */
export const hardening = defineCheck({
  id: "hardening",
  title: "Kernel hardening settings",
  category: "security",
  premium: true,
  async run(ctx) {
    const findings = [];
    const missing = [];
    for (const item of HARDENING) {
      const res = await ctx.run(`sysctl -n ${shq(item.key)} 2>/dev/null`);
      const value = res.ok ? res.stdout.trim() : "";
      if (!isSatisfied(value, item)) missing.push(item);
    }
    if (missing.length === 0) {
      findings.push(finding({
        severity: "info",
        code: "hardening/ok",
        title: "Kernel hardening is solid",
        detail: `All ${HARDENING.length} hardening settings we check are enabled (kernel pointers hidden, dmesg restricted, BPF blocked, rp_filter and syncookies on).`,
        evidence: HARDENING.map((h) => `${h.key}=${h.want}`).join("\n"),
        fix: null,
        confidence: "high",
      }));
      return findings;
    }
    findings.push(finding({
      severity: missing.length >= 3 ? "high" : "medium",
      code: "hardening/missing",
      title: `${missing.length} kernel hardening setting${missing.length === 1 ? "" : "s"} off`,
      detail: `These settings reduce the kernel's attack surface and are off on this system: ${missing.map((m) => m.key).join(", ")}. ${missing[0]?.why}`,
      evidence: missing.map((m) => `${m.key} (${m.why})`).join("\n"),
      fix: "Apply them in /etc/sysctl.d/99-hardening.conf and run `sudo sysctl --system`. On distributions with a security profile (e.g. Ubuntu's `ubuntu-security` apparmor profile), the distro docs are the safer way to enable these.",
      confidence: "medium",
    }));
    return findings;
  },
});