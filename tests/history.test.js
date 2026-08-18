import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { score, historyFile, loadHistory, saveRun, newFindings, diffSinceLast } from "../src/history.js";

test("score: healthy system is 100", () => {
  assert.equal(score([]), 100);
  assert.equal(score([{ severity: "info" }, { severity: "info" }]), 100);
});

test("score: subtracts 15 per high and 8 per medium, floors at 0", () => {
  assert.equal(score([{ severity: "high" }]), 85);
  assert.equal(score([{ severity: "medium" }]), 92);
  assert.equal(score([{ severity: "high" }, { severity: "medium" }]), 77);
  assert.equal(score([{ severity: "high" }, { severity: "high" }, { severity: "medium" }, { severity: "medium" }]), 54);
  const many = Array.from({ length: 20 }, () => ({ severity: "high" }));
  assert.equal(score(many), 0);
});

test("newFindings: flags findings whose title is not in the previous run", () => {
  const runs = [{ findings: [{ title: "Disk nearly full" }, { title: "Old issue" }] }];
  const current = [
    { title: "Disk nearly full" },
    { title: "New issue appeared" },
    { title: "Another new one" },
  ];
  const fresh = newFindings(current, runs);
  assert.deepEqual(
    fresh.map((f) => f.title),
    ["New issue appeared", "Another new one"]
  );
});

test("newFindings: no previous run means nothing is new", () => {
  assert.deepEqual(newFindings([{ title: "X" }], []), []);
});

test("diffSinceLast: reports added and fixed findings (title fallback when no code)", () => {
  const runs = [{ findings: [{ severity: "medium", title: "Old issue" }, { severity: "info", title: "Still here" }] }];
  const current = [
    { severity: "high", title: "Still here" },
    { severity: "medium", title: "Brand new" },
  ];
  const diff = diffSinceLast(current, runs);
  assert.deepEqual(diff.added, [{ code: "Brand new", severity: "medium", title: "Brand new" }]);
  assert.deepEqual(diff.fixed, [{ code: "Old issue", severity: "medium", title: "Old issue" }]);
});

test("diffSinceLast: matches by stable code, so a volatile count in the title does not churn", () => {
  const runs = [{ findings: [{ severity: "medium", code: "services/failed", title: "3 services failed to start" }] }];
  const current = [{ severity: "medium", code: "services/failed", title: "2 services failed to start" }];
  const diff = diffSinceLast(current, runs);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.fixed, []);
});

test("newFindings: matches by code when present, so volatile titles do not churn", () => {
  const runs = [{ findings: [{ code: "updates/pending", title: "5 updates available" }] }];
  const current = [
    { code: "updates/pending", title: "7 updates available" },
    { code: "services/failed", title: "1 service failed to start" },
  ];
  const fresh = newFindings(current, runs);
  assert.deepEqual(fresh.map((f) => f.title), ["1 service failed to start"]);
});

test("diffSinceLast: no previous run means nothing changed", () => {
  assert.deepEqual(diffSinceLast([{ title: "X" }], []), { added: [], fixed: [] });
});

test("saveRun: writes atomically via temp file and leaves no residue", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-hist-"));
  const file = join(dir, "history.json");
  process.env.LINUX_DOCTOR_HISTORY = file;
  try {
    saveRun({ at: "t1", score: 90, findings: [] }, file);
    saveRun({ at: "t2", score: 80, findings: [] }, file);
    assert.equal(existsSync(`${file}.tmp`), false, "no temp file left behind");
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(parsed.runs.length, 2);
    assert.equal(parsed.runs[1].at, "t2");
  } finally {
    delete process.env.LINUX_DOCTOR_HISTORY;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("historyFile: respects LINUX_DOCTOR_HISTORY override", () => {
  process.env.LINUX_DOCTOR_HISTORY = "/tmp/ld-test-history.json";
  try {
    assert.equal(historyFile(), "/tmp/ld-test-history.json");
  } finally {
    delete process.env.LINUX_DOCTOR_HISTORY;
  }
});

test("saveRun/loadHistory: round-trips and keeps only the last 50 runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-hist-"));
  const file = join(dir, "history.json");
  process.env.LINUX_DOCTOR_HISTORY = file;
  try {
    for (let i = 0; i < 55; i += 1) {
      saveRun({ at: String(i), score: i, counts: {}, findings: [] }, file);
    }
    const runs = loadHistory(file);
    assert.equal(runs.length, 50, "history is capped at 50 runs");
    assert.equal(runs[0].at, "5", "oldest kept run is the 6th");
    assert.equal(runs[49].at, "54");
  } finally {
    delete process.env.LINUX_DOCTOR_HISTORY;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saveRun: unwritable location fails silently", () => {
  // A path whose parent is a regular file fails fast with ENOTDIR (avoids
  // slow/hanging mkdir on special filesystems like /proc).
  const dir = mkdtempSync(join(tmpdir(), "ld-hist-"));
  const blocker = join(dir, "blocker");
  writeFileSync(blocker, "");
  process.env.LINUX_DOCTOR_HISTORY = join(blocker, "history.json");
  try {
    assert.doesNotThrow(() => saveRun({ findings: [] }));
  } finally {
    delete process.env.LINUX_DOCTOR_HISTORY;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadHistory: missing or corrupt file returns an empty list", () => {
  assert.deepEqual(loadHistory("/nonexistent/path/history.json"), []);
  const dir = mkdtempSync(join(tmpdir(), "ld-hist-"));
  const file = join(dir, "bad.json");
  try {
    process.env.LINUX_DOCTOR_HISTORY = file;
    writeFileSync(file, "{ not json !!");
    assert.deepEqual(loadHistory(file), []);
  } finally {
    delete process.env.LINUX_DOCTOR_HISTORY;
    rmSync(dir, { recursive: true, force: true });
  }
});
