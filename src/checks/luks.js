import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Checks whether the system uses full-disk encryption. Reads `lsblk` output
 * looking for `crypto_LUKS` partitions or opened `crypt` mappers. Read-only.
 */

export const luks = defineCheck({
  id: "luks",
  title: "Disk encryption (LUKS)",
  category: "security",
  async run(ctx) {
    const findings = [];

    const res = await ctx.run("lsblk -o NAME,FSTYPE,TYPE -n 2>/dev/null");
    if (res.missing) {
      // No lsblk — cannot inspect the block devices.
      return findings;
    }

    const devices = lines(res.stdout);
    const encrypted = devices.filter((l) => /crypto_luks|crypt/i.test(l));

    if (encrypted.length > 0) {
      findings.push(finding({
        severity: "info",
        code: "luks/encrypted",
        title: "Disk encryption is active",
        detail: "The system uses LUKS/disk encryption, so the data at rest is protected if the drive is stolen or removed.",
        evidence: encrypted.slice(0, 3).join("\n"),
        fix: null,
        confidence: "high",
      }));
    } else if (devices.length > 0) {
      // Running unencrypted is a deliberate choice, not a detected fault —
      // informational so a healthy install is not penalized in the score.
      findings.push(finding({
        severity: "info",
        code: "luks/none",
        title: "No full-disk encryption detected",
        detail: "No LUKS or crypt devices were found. If this drive is lost or stolen, the data on it can be read directly.",
        evidence: "lsblk: no crypto_LUKS / crypt devices",
        fix: "Re-encrypting in place is risky; the clean path is to back up, then reinstall with disk encryption enabled (LUKS). For laptops this is strongly recommended.",
        confidence: "medium",
      }));
    }

    return findings;
  },
});
