/**
 * Safe-fix catalog ↔ code registry — bidirectional consistency (Phase 5).
 *
 * The fix catalog keys into findings by stable code, so it inherits the
 * registry's identity guarantee — but only if every catalog entry IS a
 * registered code. A typo'd or renamed key would silently produce a plan
 * that can never match anything; a catalog drifting out of the registry
 * breaks that trust at test time, not in someone's terminal.
 *
 * REGISTRY is imported from codes-registry.test.js: the registry has exactly
 * one home. This test adds a consumer-side pin, not a second source of truth.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { planFixes } from "../src/fix.js";
import { REGISTRY } from "./codes-registry.test.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixSource = readFileSync(join(root, "src", "fix.js"), "utf8");

/** Catalog keys are top-level `"check/reason":` entries in src/fix.js. */
function catalogCodes() {
  const codes = new Set();
  for (const m of fixSource.matchAll(/^[ \t]*"([a-z0-9-]+\/[a-z0-9-]+)"[ \t]*:/gm)) {
    codes.add(m[1]);
  }
  return [...codes].sort();
}

test("fixCatalog: every catalog key is a registered finding code", () => {
  const codes = catalogCodes();
  assert.ok(codes.length > 0, "no catalog codes found — did the CATALOG move? update this parser");
  const unregistered = codes.filter((c) => !REGISTRY[c]);
  assert.deepEqual(
    unregistered,
    [],
    `safe-fix catalog keys not in the code registry: ${unregistered.join(", ")}`
  );
});

test("fixCatalog: every entry still produces commands for a matching finding", () => {
  // A synthetic finding per catalog code. The evidence deliberately carries
  // every parameter kind the parsers look for (a .service AND a .timer unit,
  // a --user scope marker) because refusing to guess IS the catalog's safety
  // contract — an empty plan from sparse text is correct behavior, not rot.
  const system = { family: "rhel", imageBased: false };
  for (const code of catalogCodes()) {
    const finding = {
      check: code.split("/")[0],
      code,
      severity: "medium",
      title: `Synthetic ${code}`,
      detail: "`example.service` failed to start",
      evidence: "example.timer enabled but never ran · example.service loaded failed user",
      fix: null,
    };
    const plan = planFixes([finding], { system });
    assert.ok(
      Array.isArray(plan) && plan.length > 0,
      `${code}: catalog entry produced an empty plan for its own finding shape`
    );
    for (const entry of plan) {
      assert.equal(entry.code, code, "plan entries keep the finding's code");
      assert.ok(entry.commands.length > 0, `${code}: plan entry has no commands`);
      for (const item of entry.commands) {
        assert.ok(["apply", "manual"].includes(item.tier), `${code}: unknown tier ${item.tier}`);
        assert.equal(typeof item.cmd, "string");
        assert.ok(item.cmd.length > 0, `${code}: empty command`);
      }
    }
  }
});
