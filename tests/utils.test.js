import { test } from "node:test";
import assert from "node:assert/strict";
import { runPool, slugify, plural } from "../src/utils.js";

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
