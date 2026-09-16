// SPDX-License-Identifier: GPL-3.0-or-later
import { journalLines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";
import { classifyHardwareLine } from "./shared.js";

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

    // The shell grep is deliberately wide (it is one cheap read): the words
    // "mce" and "edac" are also carried by routine boot lines, so the
    // classification happens in JS where a benign line can be rejected instead
    // of becoming a finding. See classifyHardwareLine.
    const ker = await ctx.run(
      'journalctl -k --since "-7 days" --no-pager -o short 2>/dev/null | grep -iE "mce|machine check|hardware error|edac|corrected error|ecc error"'
    );
    const all = ker.ok ? journalLines(ker.stdout, { tail: 40 }) : [];
    const mceLines = all.filter((l) => classifyHardwareLine(l) === "mce").slice(-5);
    const edcLines = all.filter((l) => classifyHardwareLine(l) === "ecc").slice(-5);

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
      // EDAC reports two very different events with the same vocabulary. A CE
      // is a bit flip the controller corrected — watch it. A UE went
      // uncorrected — that memory was wrong, so it is data loss, not a
      // warning. Same root cause, so the same code; the severity is not.
      const uncorrected = edcLines.some((l) => /\bUE\b|uncorrected|unrecoverable/i.test(l));
      findings.push(finding({
        severity: uncorrected ? "high" : "medium",
        code: "hardware/ecc",
        title: uncorrected ? "Uncorrected memory errors (ECC)" : "Corrected hardware errors (ECC)",
        detail: uncorrected
          ? "The memory controller reported an uncorrected error: a bit flip it could not fix. Whatever that memory held was wrong, and the module is the suspect. Treat this as data loss, not as a warning to watch."
          : "The memory controller detected and corrected some bit-flip errors. Occasional ones are normal and ECC is doing its job, but frequent ones suggest a DIMM is starting to fail.",
        evidence: edcLines.join("\n"),
        fix: uncorrected
          ? "Back up your data now. Run a memory test (Memtest86+ from your boot menu), reseat the suspect DIMM, and replace it if the test fails."
          : "If these repeat often, test the memory (Memtest86+) and reseat or replace the suspect DIMM.",
        confidence: uncorrected ? "high" : "medium",
      }));
    } else if (ker.ok) {
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
