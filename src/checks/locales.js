import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Locale sanity. A missing locale manifests as "Failed to set locale" or
 * "Cannot set LC_*" on every login — one of the most common confusing
 * breakages on minimal distro installs.
 */

export const locales = defineCheck({
  id: "locales",
  title: "Locale configuration",
  category: "system",
  async run(ctx) {
    const findings = [];

    const res = await ctx.run("locale 2>&1");
    const output = `${res.stdout}\n${res.stderr}`;
    if (!/failed to set locale|cannot set LC_/i.test(output)) return findings;

    findings.push(finding({
      severity: "medium",
      code: "locales/broken",
      title: "System locale is broken",
      detail: "The configured locale is not generated on this system, so programs fall back to English (or fail to start) and date/number formatting is inconsistent.",
      evidence: lines(output).filter((l) => /locale|LC_/i.test(l)).slice(0, 3).join("\n") || output.trim(),
      fix: "Install or generate the missing locale: on Fedora-family `sudo dnf install glibc-langpack-<lang>`, on Debian-family `sudo locale-gen <LANG>` then `sudo update-locale`.",
      confidence: "high",
    }));
    return findings;
  },
});