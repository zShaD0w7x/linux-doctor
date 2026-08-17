import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_THRESHOLDS, loadThresholds } from "../src/thresholds.js";
import { loadConfig } from "../src/config.js";

test("loadThresholds: returns defaults when config has no thresholds", () => {
  assert.deepEqual(loadThresholds({}), DEFAULT_THRESHOLDS);
  assert.deepEqual(loadThresholds({ ignore: ["x"] }), DEFAULT_THRESHOLDS);
});

test("loadThresholds: user values merge over defaults", () => {
  const t = loadThresholds({ thresholds: { diskFullPct: 80 } });
  assert.equal(t.diskFullPct, 80);
  assert.equal(t.diskWarnPct, DEFAULT_THRESHOLDS.diskWarnPct);
  assert.equal(t.memLowRatio, DEFAULT_THRESHOLDS.memLowRatio);
});

test("loadThresholds: non-object thresholds fall back to defaults", () => {
  assert.deepEqual(loadThresholds({ thresholds: "nope" }), DEFAULT_THRESHOLDS);
  assert.deepEqual(loadThresholds({ thresholds: [1, 2] }), DEFAULT_THRESHOLDS);
  assert.deepEqual(loadThresholds(null), DEFAULT_THRESHOLDS);
});

test("loadConfig: missing or corrupt file returns {}", () => {
  assert.deepEqual(loadConfig("/nonexistent/config.json"), {});
  const dir = mkdtempSync(join(tmpdir(), "ld-cfg-"));
  const file = join(dir, "config.json");
  try {
    writeFileSync(file, "{ nope");
    assert.deepEqual(loadConfig(file), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig: reads ignore and thresholds together", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cfg-"));
  const file = join(dir, "config.json");
  try {
    writeFileSync(file, JSON.stringify({ ignore: ["a"], thresholds: { diskFullPct: 80 } }));
    const c = loadConfig(file);
    assert.deepEqual(c.ignore, ["a"]);
    assert.equal(c.thresholds.diskFullPct, 80);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
