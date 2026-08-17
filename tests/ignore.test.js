import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIgnore, addIgnore, isIgnored } from "../src/ignore.js";

function tempConfig() {
  const dir = mkdtempSync(join(tmpdir(), "ld-ignore-"));
  return join(dir, "config.json");
}

test("isIgnored: matches case-insensitively on the title", () => {
  assert.equal(isIgnored("3 services failed to start", ["services failed"]), true);
  assert.equal(isIgnored("3 services failed to start", ["SERVICES FAILED"]), true);
  assert.equal(isIgnored("System is up to date", ["services failed"]), false);
  assert.equal(isIgnored("anything", []), false);
  assert.equal(isIgnored("anything", null), false);
  assert.equal(isIgnored("anything", ["fw-fanctrl"]), false);
});

test("loadIgnore: missing config file returns an empty list", () => {
  assert.deepEqual(loadIgnore(tempConfig()), []);
});

test("loadIgnore: corrupt config returns an empty list", () => {
  const file = tempConfig();
  writeFileSync(file, "not json {{");
  assert.deepEqual(loadIgnore(file), []);
});

test("addIgnore: writes the pattern and survives a reload", () => {
  const file = tempConfig();
  assert.equal(addIgnore("Suspend hooks are failing", file), true);
  assert.deepEqual(loadIgnore(file), ["Suspend hooks are failing"]);
  // Adding the same pattern again is a no-op.
  addIgnore("Suspend hooks are failing", file);
  assert.deepEqual(loadIgnore(file), ["Suspend hooks are failing"]);
  rmSync(file, { force: true });
});

test("addIgnore: empty pattern is rejected", () => {
  assert.equal(addIgnore("   ", tempConfig()), false);
  assert.equal(addIgnore("", tempConfig()), false);
});

test("addIgnore: preserves other config keys (thresholds)", () => {
  const file = tempConfig();
  writeFileSync(file, JSON.stringify({ thresholds: { diskFullPct: 80 } }));
  assert.equal(addIgnore("Suspend hooks are failing", file), true);
  const config = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(config.ignore, ["Suspend hooks are failing"]);
  assert.equal(config.thresholds.diskFullPct, 80, "thresholds must survive an ignore write");
  rmSync(file, { force: true });
});
