import { journalLines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Checks the kernel log for hardware errors: machine check exceptions (MCE —
 * uncorrected, serious) and corrected ECC/memory errors (EDC — the hardware
 * caught and fixed a bit flip, which repeated often means a failing DIMM).
 * Read-only; same journalctl separator filtering as the other log checks.
 */

export const hardware = defineCheck({
  id: "hardware",
  title: "Hardware errors (MCE/ECC)",
  category: "hardware",
  async run(ctx) {
    const findings = [];

    const [mce, edc] = await Promise.all([
      ctx.run('journalctl -k -g "mce|machine check|hardware error" --since "-7 days" --no-pager -o short 2>/dev/null'),
      ctx.run('journalctl -k -g "edac|corrected error|ECC error" --since "-7 days" --no-pager -o short 2>/dev/null'),
    ]);

    const mceLines = mce.ok ? journalLines(mce.stdout, { tail: 5 }) : [];
    const edcLines = edc.ok ? journalLines(edc.stdout, { tail: 5 }) : [];

    if (mceLines.length > 0) {
      findings.push(finding({
        severity: "high",
        code: "hardware/mce",
        title: "Machine check exceptions detected",
        detail: "The kernel recorded machine check exceptions — uncorrected hardware errors. These are a strong sign of failing CPU, memory, or a motherboard issue, and they can corrupt data.",
        evidence: mceLines.join("\n"),
        fix: "Back up your data now, then test the hardware: run a memory test (e.g. Memtest86+ from your boot menu) and check the CPU temperature and cooling. If the errors persist, replace the suspect component.",
        confidence: "high",
      }));
    } else if (edcLines.length > 0) {
      findings.push(finding({
        severity: "medium",
        code: "hardware/ecc",
        title: "Corrected hardware errors (ECC)",
        detail: "The memory controller detected and corrected some bit-flip errors. Occasional ones are normal and ECC is doing its job, but frequent ones suggest a DIMM is starting to fail.",
        evidence: edcLines.join("\n"),
        fix: "If these repeat often, test the memory (Memtest86+) and reseat or replace the suspect DIMM.",
        confidence: "medium",
      }));
    } else if (mce.ok || edc.ok) {
      findings.push(finding({
        severity: "info",
        code: "hardware/ok",
        title: "No hardware errors logged",
        detail: "No machine check exceptions or corrected memory errors were found in the last 7 days of kernel logs.",
        evidence: "mce: none · edac/ecc: none",
        fix: null,
        confidence: "high",
      }));
    }

    return findings;
  },
});
