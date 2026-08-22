/**
 * Static shell-injection guardrail.
 *
 * The codebase builds shell command strings and runs them through exec() —
 * acceptable because every interpolated value MUST be quoted with shq().
 * This test enforces that invariant mechanically: any template literal passed
 * to run()/ctx.run() whose interpolation is not wrapped in shq() (or a local
 * quoting helper such as battery.js's sysfs()) fails the suite. A future check
 * author who interpolates raw external data now gets a red test instead of a
 * quiet injection hole.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname;

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}

/** Interpolation helpers that quote their arguments themselves. */
const QUOTING_HELPERS = /^(shq|sysfs)\s*\(/;

test("every interpolated shell command quotes its substitutions with shq()", () => {
  const offenders = [];
  for (const file of listFiles(ROOT)) {
    const text = readFileSync(file, "utf8");
    const rel = file.replace(ROOT, "");
    // Template literals handed to run(...): capture up to the closing backtick.
    for (const m of text.matchAll(/\brun\(\s*`([\s\S]*?)`\s*[),]/g)) {
      const cmd = m[1];
      if (!cmd.includes("${")) continue;
      for (const s of cmd.matchAll(/\$\{([^}]+)\}/g)) {
        const expr = s[1].trim();
        if (!QUOTING_HELPERS.test(expr)) {
          const lineNo = text.slice(0, m.index).split("\n").length;
          offenders.push(`${rel}:${lineNo} → \${${expr}}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `unquoted shell interpolations found:\n${offenders.join("\n")}`);
});
