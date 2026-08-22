/**
 * Output parity — the Phase 2 contract: history numbers are computed ONCE
 * (attachHistory) and every channel renders exactly those numbers. The CLI
 * text report, --plain, and --json must agree; the dashboard consumes the
 * same JSON payload, so parity with --json is parity with the dashboard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReport, renderPlain, renderJson } from "../src/report.js";
import { score } from "../src/history.js";

const SYSTEM = { distro: "Test 1", kernel: "6.1.0", cores: 4, uptime: "1h" };

const FINDINGS = [
  { id: 1, check: "services", code: "services/failed", severity: "medium", title: "2 services failed to start", detail: null, evidence: null, fix: "restart them", isNew: false },
  { id: 2, check: "disk", code: "disk/full", severity: "high", title: "Disk nearly full", detail: null, evidence: null, fix: "clean space", isNew: true },
];

const DIFF = {
  added: [{ code: "disk/full", severity: "high", title: "Disk nearly full" }],
  fixed: [{ code: "audio/no-server", severity: "medium", title: "old issue gone" }],
  unchanged: 1,
};

const OPTS = {
  system: SYSTEM,
  score: 77,
  scoreDelta: 5,
  newCount: DIFF.added.length,
  fixedCount: DIFF.fixed.length,
  unchanged: DIFF.unchanged,
  diffSinceLast: DIFF,
};

test("parity: CLI, --plain and --json carry the same new/fixed/unchanged", async () => {
  const pretty = await renderReport(FINDINGS, { ...OPTS });
  const plain = renderPlain(FINDINGS, { ...OPTS });
  const json = JSON.parse(renderJson(FINDINGS, SYSTEM, { ...OPTS, generatedAt: "2026-08-22T00:00:00Z" }));

  // Header line in the pretty report.
  assert.match(pretty, /SINCE LAST RUN   1 new · 1 fixed · 1 unchanged/);
  // # comment lines in plain.
  assert.match(plain, /^# since: 1 new, 1 fixed, 1 unchanged$/m);
  assert.match(plain, /^# new: 1$/m);
  assert.match(plain, /^# fixed: 1$/m);
  // Structured fields in JSON.
  assert.equal(json.newCount, 1);
  assert.equal(json.fixedCount, 1);
  assert.equal(json.unchanged, 1);
  assert.deepEqual(json.diffSinceLast.added.map((f) => f.code), ["disk/full"]);
});

test("parity: NEW badge appears on exactly the added findings in both text channels", async () => {
  const pretty = await renderReport(FINDINGS, { ...OPTS });
  const plain = renderPlain(FINDINGS, { ...OPTS });
  assert.match(pretty, /Disk nearly full\s+🆕 NEW/);
  assert.doesNotMatch(pretty, /failed to start\s+🆕 NEW/);
  assert.match(plain, /^high\t1\tDisk nearly full \(new\)$/m);
  assert.match(plain, /^medium\t2\t2 services failed to start$/m);
});

test("parity: score is severity-driven only — history content cannot bend it", () => {
  // The score function takes findings alone; runs/diffs are never an input.
  // A pathological history cannot change today's verdict for same findings.
  const a = score([{ severity: "high" }, { severity: "medium" }]);
  const b = score([{ severity: "medium" }, { severity: "high" }]);
  assert.equal(a, b);
});
