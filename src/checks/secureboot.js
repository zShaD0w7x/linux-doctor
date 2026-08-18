import { lines } from "../utils.js";

/**
 * Checks UEFI boot mode, Secure Boot state, and TPM presence. All reads are
 * from sysfs/efivars or mokutil — nothing is modified.
 */
import { defineCheck } from "./define.js";

export const secureboot = defineCheck({
  id: "secureboot",
  title: "Secure Boot and TPM",
  category: "security",
  async run(ctx) {
    const findings = [];

    const [efi, sbVar, mok, tpm] = await Promise.all([
      ctx.run("ls /sys/firmware/efi 2>/dev/null | head -1"),
      ctx.run("od -An -tu1 /sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c 2>/dev/null"),
      ctx.run("mokutil --sb-state 2>/dev/null"),
      ctx.run("ls /sys/class/tpm/tpm0 2>/dev/null"),
    ]);

    if (!efi.ok || efi.stdout.trim() === "") {
      findings.push({
        severity: "info",
        title: "Legacy BIOS boot",
        detail: "This system boots in legacy BIOS mode, so Secure Boot (a UEFI feature) does not apply. Modern firmware is a good upgrade path if you want Secure Boot and a TPM.",
        evidence: "no /sys/firmware/efi",
        fix: null,
        confidence: "high",
      });
      return findings;
    }

    // Prefer mokutil's readable output; fall back to the raw efivar (its last
    // byte is 1 when Secure Boot is enabled, 0 when disabled).
    const mokText = mok.stdout || "";
    let sbEnabled = null;
    if (/SecureBoot\s+enabled/i.test(mokText)) sbEnabled = true;
    else if (/SecureBoot\s+disabled/i.test(mokText)) sbEnabled = false;
    else {
      const tokens = lines(sbVar.stdout).join(" ").trim().split(/\s+/).filter(Boolean);
      const last = Number(tokens[tokens.length - 1]);
      if (tokens.length > 0 && (last === 0 || last === 1)) sbEnabled = last === 1;
    }

    if (sbEnabled === true) {
      findings.push({
        severity: "info",
        title: "Secure Boot is enabled",
        detail: "Secure Boot verifies the boot chain, which helps protect against tampering before the OS loads.",
        evidence: "SecureBoot enabled",
        fix: null,
        confidence: "high",
      });
    } else if (sbEnabled === false) {
      // Disabled Secure Boot is a hardware/config choice, not a detected
      // fault — informational so it does not drag down the health score.
      findings.push({
        severity: "info",
        title: "Secure Boot is disabled",
        detail: "Secure Boot is off, so nothing verifies the boot chain against tampering. On most systems this is a firmware setting, not a Linux setting.",
        evidence: "SecureBoot disabled",
        fix: "Enable it in your firmware (BIOS/UEFI) setup, or with: `sudo mokutil --enable-validation`",
        confidence: "medium",
      });
    }

    if (tpm.ok && tpm.stdout.trim() !== "") {
      findings.push({
        severity: "info",
        title: "TPM is present",
        detail: "A Trusted Platform Module is available, which enables disk encryption (LUKS with TPM unlock) and measured boot.",
        evidence: "/sys/class/tpm/tpm0",
        fix: null,
        confidence: "high",
      });
    } else {
      // A missing TPM is a hardware limitation, not a fault — informational.
      findings.push({
        severity: "info",
        title: "No TPM detected",
        detail: "No TPM was found. A TPM strengthens disk encryption and is increasingly expected by operating systems.",
        evidence: "no /sys/class/tpm/tpm0",
        fix: "Enable the TPM in your firmware (BIOS/UEFI) settings, or add a discrete TPM module.",
        confidence: "medium",
      });
    }

    return findings;
  },
});
