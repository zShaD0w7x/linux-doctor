import { test } from "node:test";
import assert from "node:assert/strict";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { run, runPool, slugify, plural, journalLines, shq } from "../src/utils.js";

const execP = promisify(exec);

test("shq: plain values are single-quoted", () => {
  assert.equal(shq("sda1"), "'sda1'");
  assert.equal(shq("/dev/sda"), "'/dev/sda'");
});

test("shq: shell metacharacters cannot break out of the quotes", () => {
  for (const evil of ["a; rm -rf /", "$(id)", "`id`", "a && b", "a | b", "../../etc", "a'b'c"]) {
    const q = shq(evil);
    assert.ok(!/[^\\]'/.test(q.slice(1, -1).replace(/'\\''/g, "")), `unescaped quote in ${q}`);
  }
});

test("shq: a quoted value survives a round-trip through the shell", async () => {
  const evil = `x'; echo PWNED; #`;
  const res = await execP(`printf %s ${shq(evil)}`);
  assert.equal(res.stdout, evil);
});

test("run: marks a hung command as timedOut instead of a plain failure", async () => {
  const res = await run("sleep 5", { timeoutMs: 150 });
  assert.equal(res.ok, false);
  assert.equal(res.timedOut, true);
});

test("run: a normal failure is not a timeout", async () => {
  const res = await run("false");
  assert.equal(res.ok, false);
  assert.equal(res.timedOut, undefined);
});

test("runPool: runs all items and preserves input order", async () => {
  const out = await runPool([1, 2, 3, 4, 5], 2, async (x) => x * 10);
  assert.deepEqual(out, [10, 20, 30, 40, 50]);
});

test("runPool: never exceeds the concurrency limit", async () => {
  let active = 0;
  let maxActive = 0;
  const out = await runPool(Array.from({ length: 8 }, (_, i) => i), 3, async (x) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
    return x;
  });
  assert.equal(out.length, 8);
  assert.ok(maxActive <= 3, `max concurrent workers was ${maxActive}`);
});

test("runPool: empty items resolve to an empty array", async () => {
  assert.deepEqual(await runPool([], 4, async () => 1), []);
});

test("runPool: a limit larger than the item count is fine", async () => {
  assert.deepEqual(await runPool([1, 2], 10, async (x) => x + 1), [2, 3]);
});

test("runPool: a worker throwing propagates the error", async () => {
  await assert.rejects(() => runPool([1, 2], 2, async () => { throw new Error("boom"); }), /boom/);
});

test("plural: singular for 1, plural otherwise", () => {
  assert.equal(plural(1, "update"), "1 update");
  assert.equal(plural(2, "update"), "2 updates");
  assert.equal(plural(0, "update"), "0 updates");
  assert.equal(plural(1, "scheduled task"), "1 scheduled task");
  assert.equal(plural(3, "scheduled task"), "3 scheduled tasks");
});

test("slugify: produces a stable lowercase machine key", () => {
  assert.equal(slugify("System is low on usable memory"), "system-is-low-on-usable-memory");
  assert.equal(slugify(" 3 services failed to start "), "3-services-failed-to-start");
  assert.equal(slugify(""), "");
  assert.equal(slugify("CPU throttling — events!"), "cpu-throttling-events");
});

test("journalLines: strips boot separators and -- No entries -- lines", () => {
  const out = [
    "-- Boot 3f1c... --",
    "Jan 01 12:00:00 host kernel: machine check",
    "-- No entries --",
    "",
  ].join("\n");
  assert.deepEqual(journalLines(out), ["Jan 01 12:00:00 host kernel: machine check"]);
});

test("journalLines: tail keeps only the last N real entries", () => {
  const out = ["-- Boot 1 --", "a", "-- Boot 2 --", "b", "c", "d"].join("\n");
  assert.deepEqual(journalLines(out, { tail: 2 }), ["c", "d"]);
});
