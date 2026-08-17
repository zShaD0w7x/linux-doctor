import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupe } from "../src/dedupe.js";

test("dedupe: findings without a key are all kept", () => {
  const out = dedupe([{ title: "a" }, { title: "b" }]);
  assert.equal(out.length, 2);
});

test("dedupe: same key keeps the higher severity", () => {
  const out = dedupe([
    { title: "weak", severity: "info", dedupeKey: "k" },
    { title: "strong", severity: "high", dedupeKey: "k" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "strong");
});

test("dedupe: equal severity keeps the first finding", () => {
  const out = dedupe([
    { title: "first", severity: "medium", dedupeKey: "k" },
    { title: "second", severity: "medium", dedupeKey: "k" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "first");
});

test("dedupe: gpu and wayland software-rendering findings collapse to one", () => {
  const out = dedupe([
    { check: "gpu", severity: "high", dedupeKey: "software-rendering", title: "GPU acceleration is not active (software rendering)" },
    { check: "wayland", severity: "high", dedupeKey: "software-rendering", title: "Wayland is falling back to software rendering" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].check, "gpu");
});

test("dedupe: mixed findings keep all unique keys plus every keyless finding", () => {
  const out = dedupe([
    { title: "keyless a" },
    { title: "keyed a1", severity: "info", dedupeKey: "x" },
    { title: "keyed a2", severity: "high", dedupeKey: "x" },
    { title: "keyless b" },
    { title: "keyed b1", severity: "medium", dedupeKey: "y" },
  ]);
  assert.equal(out.length, 4);
  assert.ok(out.some((f) => f.title === "keyed a2"), "the higher-severity keyed finding survives");
  assert.ok(out.some((f) => f.title === "keyed b1"));
  assert.ok(out.some((f) => f.title === "keyless a"));
  assert.ok(out.some((f) => f.title === "keyless b"));
});
