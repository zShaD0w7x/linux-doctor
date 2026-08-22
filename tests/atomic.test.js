import { test } from "node:test";
import assert from "node:assert/strict";
import { skippedOnAtomic } from "../src/cli.js";
import { checks } from "../src/checks/index.js";
import { reboot } from "../src/checks/reboot.js";

test("reboot check declares skipOnAtomic with a reason", () => {
  assert.equal(reboot.skipOnAtomic, true);
  assert.ok(reboot.atomicReason && reboot.atomicReason.length > 0);
});

test("skippedOnAtomic: on a classic system nothing is skipped", () => {
  const { selected, skipped } = skippedOnAtomic(checks, false);
  assert.equal(skipped.length, 0);
  assert.equal(selected.length, checks.length);
});

test("skippedOnAtomic: on an atomic system, skipOnAtomic checks are split out with a reason", () => {
  const { selected, skipped } = skippedOnAtomic(checks, true);
  const skippedIds = skipped.map((s) => s.id);
  assert.ok(skippedIds.includes("reboot"), "reboot must be skipped on atomic systems");
  assert.ok(!selected.some((c) => c.id === "reboot"));
  for (const s of skipped) {
    assert.ok(s.reason && s.reason.length > 0, `${s.id} skipped entry must carry a reason`);
  }
});
