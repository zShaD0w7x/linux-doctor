#!/usr/bin/env node
/**
 * Generate docs/checks.md from the check registry.
 * Keeps the check catalogue in sync with the code — no manual drift.
 * Run: node scripts/generate-check-docs.mjs
 */
import { checks } from "../src/checks/index.js";
import { REGISTRY } from "../tests/codes-registry.test.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const out = [];
out.push("# Check catalogue");
out.push("");
out.push("Every finding `code` is stable — use it for `--ignore-code`, history diffing, and scripting. Generated from `src/checks/index.js` + `tests/codes-registry.test.js`; do not edit by hand.");
out.push("");
out.push(`Total: **${checks.length} checks** → **${Object.keys(REGISTRY).length} codes**.`);
out.push("");
out.push("| Check | Category | Codes | Severity |");
out.push("|---|---|---|---|");
for (const c of checks) {
  const codes = Object.entries(REGISTRY)
    .filter(([code]) => code.startsWith(c.id + "/") || code === c.id)
    .map(([code, meta]) => `\`${code}\` (${meta.sev.join("/")})`)
    .join("<br>");
  out.push(`| \`${c.id}\` — ${c.title} | ${c.category} | ${codes || "—"} | ${c.appliesTo.join("/")} |`);
}
out.push("");
out.push("See `docs/severity.md` for how severities are decided, and `src/fix.js` for the safe-fix catalogue.");

const file = join(import.meta.dirname, "..", "docs", "checks.md");
writeFileSync(file, out.join("\n") + "\n");
console.log(`✓ Wrote ${file} (${checks.length} checks)`);
