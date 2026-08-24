/**
 * GUI smoke test: evaluates the dashboard's <script> from the BUILT
 * src-gui/index.html inside a stubbed browser environment (vm).
 *
 * Catches the class of bug where top-level let/const are used before
 * initialization because of module concatenation order: function
 * declarations hoist across the whole single-script scope, but
 * load-time state (`let activeFilter`, `const POLL_MS`, …) does not.
 *
 * Two passes:
 *  1. live mode   — init.js runs load() → fetch fails → error path renders
 *  2. static mode — window.__DATA__ present → render() runs synchronously
 *    (this is the --html export path and the deepest synchronous code path)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "src-gui", "index.html"), "utf8");

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "built index.html must contain a <script> block");
const script = scriptMatch[1];
assert.ok(script.length > 10000, "script block should contain the concatenated app code");

/** Absorbing proxy: any property access / call returns another absorb. */
function makeAbsorb() {
  const absorb = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
        return () => "";
      }
      if (prop === "length") return 0;
      if (prop === Symbol.iterator) return function * () {};
      return absorb;
    },
    set() { return true; },
    apply() { return absorb; },
  });
  return absorb;
}

function makeSandbox({ staticData }) {
  const absorb = makeAbsorb();
  const document = {
    querySelector: () => absorb,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    documentElement: { setAttribute: () => {}, getAttribute: () => null },
    createElement: () => absorb,
    createTreeWalker: () => ({ nextNode: () => false }),
    normalize: () => {},
    body: absorb,
    hidden: false,
  };
  const sandbox = {
    document,
    window: {
      matchMedia: () => ({ matches: true, addEventListener: () => {} }),
      addEventListener: () => {},
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: {},
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    // Stub timers so a stray interval can't keep the test process alive.
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
    fetch: () => Promise.resolve({ ok: false }),
  };
  if (staticData) sandbox.window.__DATA__ = staticData;
  return vm.createContext(sandbox);
}

const sampleReport = () => ({
  schemaVersion: 1,
  tool: "linux-doctor",
  version: "0.3.0",
  generatedAt: new Date().toISOString(),
  score: 70,
  scoreDelta: 2,
  newCount: 1,
  fixedCount: 0,
  cleanStreak: 0,
  checksRun: 35,
  checksSkipped: 0,
  system: { distro: "Test Linux", kernel: "6.0-test", cores: 2, uptime: "1h" },
  findings: [
    {
      id: 1,
      severity: "high",
      code: "disk/full",
      title: "Disk almost full",
      detail: "A partition is nearly full.",
      evidence: "/dev/sda1 95%",
      fix: "Free some space.",
      check: "disk",
    },
    {
      id: 2,
      severity: "info",
      code: "backup/none",
      title: "No backup tool found",
      detail: "Consider installing one.",
      check: "backup",
    },
  ],
  diffSinceLast: { added: [], fixed: [] },
  checkErrors: [],
});

test("gui script evaluates without errors in live mode (no TDZ/ordering bugs)", () => {
  const sandbox = makeSandbox({ staticData: null });
  assert.doesNotThrow(() => vm.runInContext(script, sandbox, { filename: "gui-bundle.js" }));
});

test("gui script renders a static report without errors (--html path)", () => {
  const sandbox = makeSandbox({ staticData: sampleReport() });
  assert.doesNotThrow(() => vm.runInContext(script, sandbox, { filename: "gui-bundle.js" }));
});

test("no fragile glyphs that render as missing boxes in WebKitGTK", () => {
  // Codepoints with spotty font coverage on Linux webviews. Buttons/labels
  // must use text or CSS shapes instead.
  const FORBIDDEN = [
    "\u29C9", // ⧉ two joined squares
    "\u2913", // ⤓ download arrow
    "\u229E", "\u229F", // ⊞ ⊟ squared plus/minus
    "\u25C9", // ◉ fisheye
    "\u2699", // ⚙ gear (emoji presentation)
    "\u23F1", "\u23F8", // stopwatch / pause
    "\u2705", "\u26A0", "\u23ED", // ✅ ⚠ ⏭ emoji-presentation glyphs
    "\u{1F5A8}", "\u{1F514}", // printer, bell
  ];
  const offenders = FORBIDDEN.filter((ch) => script.includes(ch));
  assert.deepEqual(offenders, [], `fragile glyphs found in bundle: ${offenders.map((c) => "U+" + c.codePointAt(0).toString(16)).join(", ")}`);
});

test("checks matrix builds from a live-shaped payload", () => {
  const sandbox = makeSandbox({ staticData: null });
  vm.runInContext(script, sandbox, { filename: "gui-bundle.js" });
  const data = sampleReport();
  data.checkErrors = [{ check: "broken", error: "boom" }];
  data.skippedChecks = [{ id: "suspend", title: "Suspend", reason: "atomic" }];
  const html = vm.runInContext(
    `checksMatrixHtml(${JSON.stringify(data)}, [
      { id: "disk", title: "Disk space", category: "system", appliesTo: ["desktop"], appliesHere: true },
      { id: "battery", title: "Battery", category: "hardware", appliesTo: ["laptop"], appliesHere: false },
      { id: "suspend", title: "Suspend hooks", category: "system", appliesTo: ["desktop"], appliesHere: true, skipOnAtomic: true },
      { id: "broken", title: "Broken check", category: "system", appliesTo: ["desktop"], appliesHere: true },
    ])`,
    sandbox,
    { filename: "matrix-eval.js" }
  );
  assert.ok(html.includes("All checks"), "matrix has a title");
  assert.ok(html.includes("4 registered"), "total counter present");
  assert.ok(html.includes("1 with findings"), "findings counter present");
  assert.ok(html.includes("1 failed to run"), "failed counter uses CLI vocabulary");
  assert.ok(html.includes('data-goto-check="disk"'), "finding row deep-links");
  assert.ok(html.includes("runs on: laptop"), "not-applicable note rendered");
  assert.ok(html.includes("atomic"), "atomic skip rendered");
  assert.ok(html.includes("boom"), "check error surfaced");
});
