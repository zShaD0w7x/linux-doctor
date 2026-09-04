import { test } from "node:test";
import assert from "node:assert/strict";
import { systemInfo, resetSystemInfoCache } from "../src/checks/system.js";

// systemInfo() reads the live machine (cheap read-only probes, memoized),
// so these assert shape and sanity — not exact values.
test("systemInfo: wiki facts have sane shapes", async () => {
  resetSystemInfoCache();
  const s = await systemInfo();
  assert.equal(typeof s.distro, "string");
  assert.equal(typeof s.kernel, "string");
  assert.ok(s.arch === null || typeof s.arch === "string");
  assert.ok(s.hostname === null || (typeof s.hostname === "string" && s.hostname.length > 0));
  assert.ok(s.cpuModel === null || typeof s.cpuModel === "string");
  assert.ok(s.memTotalBytes === null || (Number.isInteger(s.memTotalBytes) && s.memTotalBytes > 0));
  assert.ok(s.desktop === null || typeof s.desktop === "string");
  assert.ok(s.sessionType === null || typeof s.sessionType === "string");
  assert.equal(typeof s.immutable, "boolean");
  assert.ok(s.atomic && typeof s.atomic === "object");
});

test("systemInfo: on Linux the core wiki facts resolve", async () => {
  resetSystemInfoCache();
  const s = await systemInfo();
  assert.ok(s.arch, "uname -m should resolve on Linux");
  assert.ok(s.cpuModel, "/proc/cpuinfo should resolve on Linux");
  assert.ok(s.memTotalBytes > 1024 ** 3, "memTotalBytes should exceed 1 GB on any real machine");
  // Regression: the os-release probe result once shadowed the node:os import,
  // so os.hostname() threw inside its try/catch and hostname silently read
  // null on every machine. A real Linux host always has a hostname.
  assert.ok(s.hostname, "os.hostname() should resolve on Linux (watch for import shadowing)");
});
