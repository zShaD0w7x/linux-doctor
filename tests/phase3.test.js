/**
 * Phase 3 tests: persistent ignore management from the CLI and the healthy
 * state's premium treatment (clean streak across all output channels).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { cleanStreak } from "../src/history.js";
import { renderReport, renderPlain } from "../src/report.js";
import { renderJson } from "../src/report.js";
import { buildSupportBundle } from "../src/support.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "doctor.js");

function withTempConfig(fn) {
  const dir = mkdtempSync(join(tmpdir(), "ld-ignore-"));
  const prev = process.env.LINUX_DOCTOR_CONFIG;
  process.env.LINUX_DOCTOR_CONFIG = join(dir, "config.json");
  try {
    return fn(dir);
  } finally {
    if (prev === undefined) delete process.env.LINUX_DOCTOR_CONFIG;
    else process.env.LINUX_DOCTOR_CONFIG = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

function runDoctor(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", timeout: 60000 });
}

test("ignore round-trip: add code, add title, list, remove both", () => {
  withTempConfig((dir) => {
    const cfg = () => JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));

    // A code-shaped value lands in ignoreCodes; free text in ignore.
    let res = runDoctor("--ignore-add", "services/failed");
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Added code: services\/failed/);
    assert.deepEqual(cfg().ignoreCodes, ["services/failed"]);

    res = runDoctor("--ignore-add", "fw-fanctrl");
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Added title pattern: fw-fanctrl/);
    assert.deepEqual(cfg().ignore, ["fw-fanctrl"]);

    // The listing reflects both lists.
    res = runDoctor("--ignore-list");
    assert.match(res.stdout, /Code patterns:/);
    assert.match(res.stdout, /  - services\/failed/);
    assert.match(res.stdout, /- fw-fanctrl/);

    // Removing works for both kinds…
    res = runDoctor("--ignore-remove", "services/failed");
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Removed code/);
    res = runDoctor("--ignore-remove", "fw-fanctrl");
    assert.equal(res.status, 0);
    // …and removing something absent fails honestly with exit 2.
    res = runDoctor("--ignore-remove", "not-there");
    assert.equal(res.status, 2);
    assert.match(res.stderr, /was not in the ignore list/);
    assert.match(res.stdout, /Ignore list is now empty\./);

    // Other config keys survive the mutations.
    res = runDoctor("--init-config");
    runDoctor("--ignore-add", "audio/no-output");
    const after = cfg();
    assert.equal(typeof after.thresholds.diskFullPct, "number", "thresholds preserved through ignore edits");
  });
});

test("cleanStreak: trailing clean runs only", () => {
  const clean = (i) => ({ at: String(i), score: 100, counts: { high: 0, medium: 0, info: 3 } });
  const dirty = (i) => ({ at: String(i), score: 60, counts: { high: 1, medium: 2, info: 3 } });
  assert.equal(cleanStreak([]), 0);
  assert.equal(cleanStreak([dirty(1)]), 0);
  assert.equal(cleanStreak([dirty(1), clean(2), clean(3)]), 2);
  assert.equal(cleanStreak([clean(1), dirty(2), clean(3)]), 1);
  assert.equal(cleanStreak([null, clean(1)]), 1); // tolerate junk defensively
});

test("healthy state premium: streak line in every text channel", async () => {
  const history = [
    { at: "a", score: 100, counts: { high: 0, medium: 0, info: 1 } },
    { at: "b", score: 100, counts: { high: 0, medium: 0, info: 2 } },
  ];
  const opts = { system: { distro: "T", kernel: "k", cores: 1, uptime: "1h" }, score: 100, newCount: 0, fixedCount: 0, unchanged: 0, history };
  const pretty = await renderReport([], { ...opts });
  const plain = renderPlain([], { ...opts });
  assert.match(pretty, /✅ Everything is clean — 3 clean run\(s\) in a row\. Keep it up\./);
  assert.ok(!pretty.includes("START HERE"), "nothing to act on when perfectly clean");

  // First clean run (no history) reads as a plain win, no fake streak.
  const first = await renderReport([], { ...opts, history: [] });
  assert.match(first, /✅ Everything is clean\. No issues found\./);

  // Info-only systems are healthy but honest about the notes below.
  const infoOnly = await renderReport(
    [{ id: 1, check: "zram", code: "zram/ok", severity: "info", title: "zram is enabled", fix: null }],
    { ...opts }
  );
  assert.match(infoOnly, /No high or medium issues — 1 informational note below\./);
  assert.ok(!plain.includes("START HERE"));
});

test("support bundle: diff titles get the same redaction as findings", () => {
  const bundle = buildSupportBundle({
    system: { distro: "T", family: "rhel", kernel: "k", cores: 1, uptime: "1h" },
    findings: [],
    diffSinceLast: {
      added: [{ code: "x/y", severity: "high", title: "Bad route via 192.168.1.24 on /home/alice/x" }],
      fixed: [],
      unchanged: 0,
    },
  });
  const t = bundle.diffSinceLast.added[0].title;
  assert.ok(t.includes("<ip-redacted>"), "IP redacted in diff titles");
  assert.ok(t.includes("<user-redacted>"), "home path redacted in diff titles");
});
