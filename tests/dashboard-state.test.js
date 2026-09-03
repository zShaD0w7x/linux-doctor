/**
 * Dashboard state invariants, evaluated against the BUILT src-gui/index.html
 * in a stubbed browser environment (vm), like tests/gui-smoke.test.js.
 *
 * Pins the two behaviors a restyle can most easily break silently:
 *  1. pollPaused() — auto-refresh must pause while the user is reading
 *     (search text, non-All filter, an open card, rerun in flight, or a
 *     hidden tab), so a background refresh never yanks their place away.
 *  2. renderTrend() first-run states — zero recorded runs hides History;
 *     exactly one run explains what will grow there (with its score);
 *     corrupt/scoreless entries degrade to "no history".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "src-gui", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.ok(script.length > 10000, "built index.html must contain the app script");

function makeEl() {
  return {
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    innerHTML: "",
    open: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    scrollIntoView() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    remove() {},
    closest() { return null; },
    matches() { return false; },
  };
}

/**
 * Sandbox with a controllable DOM: `state.hidden` flips document.hidden,
 * `el(sel)` returns the stub element for a selector, and `lists` backs
 * querySelectorAll so tests can simulate open cards.
 */
function makeSandbox() {
  const els = new Map();
  const lists = new Map();
  const state = { hidden: false };
  const el = (sel) => {
    if (!els.has(sel)) els.set(sel, makeEl());
    return els.get(sel);
  };
  const document = {
    get hidden() { return state.hidden; },
    querySelector: (sel) => el(sel),
    querySelectorAll: (sel) => lists.get(sel) || [],
    getElementById: (id) => el("#" + id),
    addEventListener: () => {},
    createElement: () => makeEl(),
    createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: () => makeEl(),
    createTreeWalker: () => ({ nextNode: () => false }),
    documentElement: makeEl(),
    body: makeEl(),
    activeElement: null,
  };
  const ctx = vm.createContext({
    document,
    window: {
      matchMedia: () => ({ matches: false, addEventListener: () => {} }),
      addEventListener: () => {},
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: {},
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
    fetch: () => Promise.resolve({ ok: false }),
  });
  // init.js runs load() → fetch fails → error path renders into stubs only.
  vm.runInContext(script, ctx, { filename: "gui-bundle.js" });
  // Reset the module-level pause inputs to a known-clean baseline.
  vm.runInContext("autoRefresh = true; pollBusy = false; activeFilter = 'all';", ctx);
  return { ctx, el, lists, state };
}

const paused = (s) => {
  const { ctx, el, lists, state } = s;
  el("#rerun").disabled = false;
  el("#search").value = "";
  state.hidden = false;
  vm.runInContext("autoRefresh = true; pollBusy = false; activeFilter = 'all';", ctx);
  lists.delete("#report details[open]");
  return vm.runInContext("pollPaused()", ctx);
};

test("pollPaused: a clean idle dashboard is NOT paused", () => {
  assert.equal(paused(makeSandbox()), false);
});

test("pollPaused: auto-refresh off, busy poll, or hidden tab pauses", () => {
  const s = makeSandbox();
  const { ctx, state } = s;
  vm.runInContext("autoRefresh = false;", ctx);
  assert.equal(vm.runInContext("pollPaused()", ctx), true);
  vm.runInContext("autoRefresh = true; pollBusy = true;", ctx);
  assert.equal(vm.runInContext("pollPaused()", ctx), true);
  vm.runInContext("pollBusy = false;", ctx);
  state.hidden = true;
  assert.equal(vm.runInContext("pollPaused()", ctx), true);
});

test("pollPaused: rerun in flight pauses", () => {
  const s = makeSandbox();
  s.el("#rerun").disabled = true;
  assert.equal(vm.runInContext("pollPaused()", s.ctx), true);
});

test("pollPaused: search text pauses (reading while filtering)", () => {
  const s = makeSandbox();
  s.el("#search").value = "disk";
  assert.equal(vm.runInContext("pollPaused()", s.ctx), true);
});

test("pollPaused: a non-All severity filter pauses", () => {
  const s = makeSandbox();
  vm.runInContext("activeFilter = 'high';", s.ctx);
  assert.equal(vm.runInContext("pollPaused()", s.ctx), true);
});

test("pollPaused: an open finding card pauses", () => {
  const s = makeSandbox();
  s.lists.set("#report details[open]", [{}]);
  assert.equal(vm.runInContext("pollPaused()", s.ctx), true);
});

// ---------------------------------------------------------------------------
// renderTrend() first-run / empty / corrupt states.
// ---------------------------------------------------------------------------

const trendCtx = (s, runs) => {
  const { ctx, el } = s;
  vm.runInContext(`fetchHistory = async () => ${JSON.stringify(runs)};`, ctx);
  return vm.runInContext("renderTrend(80)", ctx).then(() => ({ trend: el("#trend").innerHTML, hidden: el("#history").hidden }));
};

test("renderTrend: zero recorded runs hides History", async () => {
  const { hidden, trend } = await trendCtx(makeSandbox(), []);
  assert.equal(hidden, true);
  assert.equal(trend, "");
});

test("renderTrend: corrupt/scoreless entries degrade to hidden History", async () => {
  const { hidden } = await trendCtx(makeSandbox(), [{ at: "x" }, { score: "bad" }, { score: null }]);
  assert.equal(hidden, true);
});

test("renderTrend: exactly one run explains what will grow there", async () => {
  const { hidden, trend } = await trendCtx(makeSandbox(), [{ at: "2026-09-01T10:00:00Z", score: 80 }]);
  assert.equal(hidden, false);
  assert.match(trend, /Only one run on record so far/);
  assert.match(trend, /80\/100/);
  assert.match(trend, /health-score trend appears here/);
});

test("renderTrend: two or more runs render the charts", async () => {
  const { ctx, el } = makeSandbox();
  vm.runInContext(
    "fetchHistory = async () => [{ at: '2026-09-01T10:00:00Z', score: 70, counts: { high: 1, medium: 0, info: 2 } }, { at: '2026-09-02T10:00:00Z', score: 80, counts: { high: 0, medium: 1, info: 2 } }];",
    ctx
  );
  await vm.runInContext("renderTrend(80)", ctx);
  const trend = el("#trend").innerHTML;
  assert.match(trend, /Health score trend/);
  assert.match(trend, /Findings by severity/);
  assert.equal(el("#hero-spark").hidden, false);
});

// ---------------------------------------------------------------------------
// scheduleHtml(): the "Daily check" strip vocabulary.
// ---------------------------------------------------------------------------

const stripHtml = (sched, notify) => {
  const s = makeSandbox();
  return vm.runInContext(`scheduleHtml(${JSON.stringify(sched)}, ${JSON.stringify(notify)})`, s.ctx);
};

test("scheduleHtml: null schedule renders nothing (strip stays hidden)", () => {
  assert.equal(stripHtml(null, "off"), "");
});

test("scheduleHtml: timer off shows state plus the setup command", () => {
  const html = stripHtml({ installed: false, enabled: false, active: false, systemd: true }, "off");
  assert.match(html, /Daily check off/);
  assert.match(html, /linux-doctor --install-timer/);
  assert.match(html, /Copy setup command/);
  assert.match(html, /Browser alerts off/);
});

test("scheduleHtml: active timer reads as on", () => {
  const html = stripHtml({ installed: true, enabled: true, active: true, systemd: true }, "on");
  assert.match(html, /Daily check on/);
  assert.match(html, /notifies only on new findings/);
  assert.match(html, /Browser alerts on/);
  assert.ok(!html.includes("install-timer"), "no setup command when the timer is healthy");
});

test("scheduleHtml: installed but inactive timer needs attention", () => {
  const html = stripHtml({ installed: true, enabled: false, active: false, systemd: true }, "off");
  assert.match(html, /needs attention/);
  assert.match(html, /linux-doctor --install-timer/);
});

test("scheduleHtml: unavailable browser notify omits the alerts bit", () => {
  const html = stripHtml({ installed: true, enabled: true, active: true, systemd: true }, "unavailable");
  assert.match(html, /Daily check on/);
  assert.ok(!html.includes("Browser alerts"), "no alerts bit when the API is unavailable");
});
