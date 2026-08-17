import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/args.js";

// parseArgs receives the full argv (like process.argv) and slices off the
// first two entries itself, so tests must mirror a real invocation.
const parse = (...flags) => parseArgs(["node", "bin/doctor.js", ...flags]);

test("parseArgs: unknown option is an error", () => {
  const out = parse("--jsonn");
  assert.match(out.error, /Unknown option "--jsonn"/);
});

test("parseArgs: unexpected positional argument is an error", () => {
  const out = parse("run");
  assert.match(out.error, /Unexpected argument "run"/);
});

test("parseArgs: value flags require a value", () => {
  assert.match(parse("--check").error, /--check requires a value/);
  assert.match(parse("--ignore", "--web").error, /--ignore requires a value/);
  assert.match(parse("--push").error, /--push requires a value/);
});

test("parseArgs: --check=memory,disk form works", () => {
  const out = parse("--check=memory,disk", "--json");
  assert.deepEqual(out.checkIds, ["memory", "disk"]);
  assert.equal(out.json, true);
  assert.equal(out.error, null);
});

test("parseArgs: repeated --check and comma values accumulate", () => {
  const out = parse("--check", "memory", "--check", "disk,load");
  assert.deepEqual(out.checkIds, ["memory", "disk", "load"]);
});

test("parseArgs: --push captures its URL", () => {
  const out = parse("--push", "https://example.com/reports");
  assert.equal(out.pushUrl, "https://example.com/reports");
});

test("parseArgs: --ignore accumulates", () => {
  const out = parse("--ignore", "fw-fanctrl", "--ignore", "SELinux");
  assert.deepEqual(out.ignore, ["fw-fanctrl", "SELinux"]);
});

test("parseArgs: boolean flags parse", () => {
  const out = parse("--plain", "--web", "--ai", "--list", "--schema", "--profile");
  assert.equal(out.plain, true);
  assert.equal(out.web, true);
  assert.equal(out.ai, true);
  assert.equal(out.list, true);
  assert.equal(out.schema, true);
  assert.equal(out.profile, true);
});

test("parseArgs: --help wins even with bad flags after it", () => {
  const out = parse("--help", "--bogus");
  assert.equal(out.help, true);
  assert.equal(out.error, null);
});
