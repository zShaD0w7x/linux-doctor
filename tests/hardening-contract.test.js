/**
 * Hardening contracts from the app-delta audit (docs/audit-app-delta-2026.md).
 * Source-level tripwires so the P0/P1 fixes cannot silently regress:
 *  - every GitHub Action is pinned to a full commit SHA (supply chain);
 *  - the bundled Node fetch uses a hardcoded hash, not a same-origin one;
 *  - the dashboard never writes free-text search into the URL;
 *  - a ?view= deep link outranks the remembered view;
 *  - the wide pane escapes every free-text field;
 *  - the build order keeps the ui-wide stub overridable by ui-detailpane;
 *  - the gui job keeps a packaging smoke check for runtime/node.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/release.yml"];

test("every action across the workflows is pinned to a 40-char commit SHA", () => {
  for (const wf of WORKFLOWS) {
    const lines = read(wf).split("\n");
    const uses = lines.filter((l) => /^\s*(-\s*)?uses:/.test(l));
    assert.ok(uses.length > 0, `${wf}: expected action usages`);
    for (const line of uses) {
      const m = line.match(/uses:\s*(\S+)/);
      assert.ok(m, `${wf}: unparseable uses line: ${line}`);
      const ref = m[1];
      assert.match(
        ref,
        /@[0-9a-f]{40}$/,
        `${wf}: "${ref}" is not pinned to a commit SHA (mutable tag/branch)`,
      );
    }
  }
});

test("the Node runtime fetch verifies a hardcoded hash (not a same-origin one)", () => {
  const src = read("scripts/fetch-node-runtime.mjs");
  assert.match(src, /const NODE_SHA256 = "[0-9a-f]{64}"/, "hardcoded sha256 required");
  assert.doesNotMatch(src, /fetch\([^)]*SHASUMS256/, "checksum must not be fetched at run time");
  assert.match(src, /AbortSignal\.timeout/, "download needs a timeout");
  assert.match(src, /mkdtempSync/, "predictable /tmp paths are not allowed");
});

test("the dashboard never writes free-text search into the URL", () => {
  const src = read("src-gui/js/ui-views.js");
  assert.doesNotMatch(src, /p\.set\(\s*"q"/, "syncUrlState must not persist ?q=");
  assert.match(src, /p\.get\(\s*"q"\s*\)/, "readUrlState may still read an explicit ?q= link");
});

test("?view= wins over the remembered view", () => {
  const src = read("src-gui/js/ui-views.js");
  assert.match(src, /urlViewApplied/, "precedence flag required");
  assert.match(src, /if\s*\(!urlViewApplied\)/, "setupViews must skip localStorage when the URL named a view");
  assert.match(src, /urlViewApplied = true/, "applyUrlState must set the flag");
});

test("the wide detail pane escapes every free-text finding field", () => {
  const src = read("src-gui/js/ui-detailpane.js");
  for (const field of ["f.title", "f.detail", "f.evidence", "f.fix", "f.code"]) {
    assert.ok(src.includes(`esc(${field}`), `${field} must be escaped in the pane`);
  }
  assert.doesNotMatch(src, /["']\s*\+\s*f\.(title|detail|evidence|fix)\s*\+/, "unescaped finding text interpolation");
});

test("build order keeps ui-wide before ui-detailpane (stub must be overridable)", () => {
  const src = read("scripts/build-gui.mjs");
  const jsOrder = src.slice(src.indexOf("const JS_ORDER"), src.indexOf("const JS_ORDER") + 2000);
  assert.ok(
    jsOrder.indexOf('"ui-wide.js"') < jsOrder.indexOf('"ui-detailpane.js"'),
    "ui-wide.js must come before ui-detailpane.js in JS_ORDER",
  );
});

test("wide mode reads a guarded bare matchMedia global", () => {
  const src = read("src-gui/js/ui-wide.js");
  assert.match(src, /typeof matchMedia === "function"/, "bare matchMedia must be guarded for the test sandbox");
});

test("the release gui job keeps a packaging smoke check for the runtime", () => {
  const src = read(".github/workflows/release.yml");
  assert.match(src, /dpkg-deb[\s\S]*runtime\/node|runtime\/node[\s\S]*dpkg-deb/, "deb payload must be checked for runtime/node");
  assert.ok((src.match(/startsWith\(github\.ref, 'refs\/tags\/v'\)/g) || []).length >= 4, "publish/attest steps must be tag-gated");
});

test("both scrub copies use linear IPv6 patterns, not the quadratic one", () => {
  for (const f of ["src/support.js", "src-gui/js/export.js"]) {
    const src = read(f);
    assert.ok(
      !src.includes(".replace(/(?:[0-9A-Fa-f]{0,4}:){2,}"),
      `${f}: the quadratic IPv6 replace must not return`,
    );
    assert.ok(
      src.includes("(?:[0-9A-Fa-f]{1,4}:){1,6}:") && src.includes("(?:[0-9A-Fa-f]{1,4}:){2,}"),
      `${f}: linear IPv6 patterns missing`,
    );
  }
});

test("the --html export escapes '<' before embedding the payload", () => {
  assert.match(read("src/cli.js"), /jsonForInlineScript\(jsonPayload\)/, "export must use jsonForInlineScript");
  assert.match(read("src/report.js"), /export function jsonForInlineScript/, "helper must stay exported");
});

test("the dashboard system header escapes every payload field", () => {
  const src = read("src-gui/js/render-status.js");
  assert.match(src, /esc\(system\.distro\)/);
  assert.match(src, /esc\(system\.kernel\)/);
  assert.match(src, /esc\(system\.uptime\)/);
});
