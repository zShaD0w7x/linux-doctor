import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCache, writeCache, cacheFile } from "../src/cache.js";

const dir = mkdtempSync(join(tmpdir(), "ld-cache-"));
const prev = process.env.LINUX_DOCTOR_CACHE;
process.env.LINUX_DOCTOR_CACHE = dir;

test.after(() => {
  if (prev === undefined) delete process.env.LINUX_DOCTOR_CACHE;
  else process.env.LINUX_DOCTOR_CACHE = prev;
  rmSync(dir, { recursive: true, force: true });
});

test("writeCache then readCache returns fresh findings", () => {
  writeCache("updates", [{ severity: "info", title: "x" }]);
  const got = readCache("updates", 60000);
  assert.deepEqual(got, [{ severity: "info", title: "x" }]);
});

test("readCache returns null when the entry is stale", () => {
  writeCache("stale", [{ severity: "info", title: "old" }]);
  // Backdate the entry well beyond any TTL.
  const file = cacheFile("stale");
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.at = new Date(Date.now() - 3600_000).toISOString();
  writeFileSync(file, JSON.stringify(data));
  assert.equal(readCache("stale", 60000), null);
});

test("readCache returns null for a corrupt file", () => {
  writeFileSync(cacheFile("corrupt"), "not json");
  assert.equal(readCache("corrupt", 60000), null);
});

test("readCache returns null when no entry exists", () => {
  assert.equal(readCache("does-not-exist", 60000), null);
});
