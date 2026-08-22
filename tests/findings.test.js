import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFindings, invalidFindings } from "../src/findings.js";

test("normalizeFindings: an explicit code wins over everything", () => {
  const out = normalizeFindings([{ check: "disk", title: "Full", code: "disk/full", dedupeKey: "disk:/dev/sda" }]);
  assert.equal(out[0].code, "disk/full");
});

test("normalizeFindings: a dedupeKey becomes the code when there is no explicit code", () => {
  const out = normalizeFindings([{ check: "gpu", title: "Software rendering", dedupeKey: "software-rendering" }]);
  assert.equal(out[0].code, "software-rendering");
});

test("normalizeFindings: slug of check id + title is the last resort", () => {
  const out = normalizeFindings([{ check: "plugin", title: "A curious thing" }]);
  assert.equal(out[0].code, "plugin/a-curious-thing");
});

test("normalizeFindings: preserves every other field", () => {
  const f = { check: "memory", title: "Low", severity: "high", detail: "d", evidence: "e", fix: "f", confidence: "high" };
  const out = normalizeFindings([f])[0];
  assert.equal(out.severity, "high");
  assert.equal(out.detail, "d");
  assert.equal(out.evidence, "e");
  assert.equal(out.fix, "f");
  assert.equal(out.title, "Low");
});

test("normalizeFindings: returns a copy, never mutates the input", () => {
  const raw = [{ check: "load", title: "Busy" }];
  const out = normalizeFindings(raw);
  assert.notEqual(out, raw);
  assert.equal(raw[0].code, undefined, "input findings must not gain a code");
});

test("invalidFindings: a well-formed finding is not flagged", () => {
  const f = { check: "memory", code: "memory/low", severity: "high", title: "Low", fix: null, detail: null, confidence: "high" };
  assert.deepEqual(invalidFindings([f]), []);
});

test("invalidFindings: flags a bad severity and a missing title", () => {
  const bad = [{ check: "plugin", code: "plugin/x", severity: "critical", title: "" }];
  const out = invalidFindings(bad);
  assert.equal(out.length, 1);
  assert.match(out[0].errors.join(" "), /severity/);
  assert.match(out[0].errors.join(" "), /title/);
  assert.equal(out[0].code, "plugin/x");
});

test("invalidFindings: a finding without a code is flagged", () => {
  const out = invalidFindings([{ check: "plugin", severity: "info", title: "Hi" }]);
  assert.equal(out.length, 1);
  assert.match(out[0].errors.join(" "), /code/);
});

test("invalidFindings: non-string fix/detail and unknown confidence are flagged", () => {
  const out = invalidFindings([{ check: "p", code: "p/x", severity: "info", title: "T", fix: 42, detail: {}, confidence: "nope" }]);
  assert.equal(out.length, 1);
  assert.match(out[0].errors.join(" "), /fix/);
  assert.match(out[0].errors.join(" "), /detail/);
  assert.match(out[0].errors.join(" "), /confidence/);
});