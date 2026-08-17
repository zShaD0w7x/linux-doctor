import { lines } from "../utils.js";

/** Split a kernel version into its numeric parts, e.g. "6.8.9-300.fc40" → [6, 8, 9, 300, 40]. */
export function parseKernelVersion(v) {
  const nums = [];
  for (const m of String(v).match(/\d+/g) || []) nums.push(Number(m));
  return nums;
}

/** True if kernel version a is newer than b (numeric, part by part). */
export function versionGt(a, b) {
  const A = parseKernelVersion(a);
  const B = parseKernelVersion(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i += 1) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Reboot status: is the newest installed kernel actually booted, and does
 * /var/run/reboot-required say a restart is pending? A running an old kernel
 * with a newer one installed is the most common reason a "fully updated"
 * system is still vulnerable — the fix is a reboot, and nobody tells you.
 *
 * Image-based (ostree) distros are skipped: they update atomically via
 * rpm-ostree (see the "updates" check) and /boot only shows the deployed
 * kernel, so a version comparison would be meaningless.
 */
import { defineCheck } from "./define.js";

export const reboot = defineCheck({
  id: "reboot",
  title: "Reboot required / kernel updates",
  category: "updates",
  async run(ctx) {
    const findings = [];

    if (ctx.dist.imageBased) return findings;

    const [bootedRes, kernelsRes, rebootFile] = await Promise.all([
      ctx.run("uname -r 2>/dev/null"),
      ctx.run("for f in /boot/vmlinuz-*; do readlink -f \"$f\"; done 2>/dev/null | sort -u | sed 's|.*/vmlinuz-||'"),
      ctx.run("[ -f /var/run/reboot-required ] && cat /var/run/reboot-required 2>/dev/null"),
    ]);
    if (!bootedRes.ok || !bootedRes.stdout.trim()) return findings;

    const booted = bootedRes.stdout.trim();
    const installed = lines(kernelsRes.stdout);
    const newer = installed.find((v) => versionGt(v, booted)) || null;
    const rebootRequired = rebootFile.ok && rebootFile.stdout.trim() !== "";

    if (!newer && !rebootRequired) {
      findings.push({
        severity: "info",
        title: "No reboot needed",
        detail: "The running kernel is the newest installed, and no restart is pending.",
        evidence: `booted: ${booted}`,
        fix: null,
        confidence: "high",
      });
      return findings;
    }

    const parts = [];
    if (newer) {
      parts.push(`A newer kernel (${newer}) is installed, but the system is running ${booted}.`);
    }
    if (rebootRequired) {
      parts.push("/var/run/reboot-required indicates a restart is needed to finish applying updates.");
    }

    findings.push({
      severity: "medium",
      title: "A reboot is required",
      detail: parts.join(" "),
      evidence: [`booted: ${booted}`, newer ? `newest installed: ${newer}` : null, rebootRequired ? "reboot-required: yes" : null]
        .filter(Boolean)
        .join("\n"),
      fix: "Reboot when convenient to activate the new kernel. Check what changed after booting with `journalctl -b -1 | head`.",
      confidence: "high",
    });
    return findings;
  },
});
