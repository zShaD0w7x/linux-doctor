#!/usr/bin/env node
/**
 * Build script for the Linux Doctor dashboard.
 *
 * Concatenates src-gui/css/*.css and src-gui/js/*.js into a single
 * index.html. The output is what web.js, Tauri, and --html all consume.
 *
 * ORDER MATTERS: the JS files share one <script> scope. Function
 * declarations are hoisted across the whole script, but top-level
 * let/const are not — so every module that declares load-time state
 * must come before init.js (the entry point), and dom.js (shared
 * helpers + report state) must come first.
 *
 * Usage:  npm run build:gui
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "src-gui");
const OUT = join(SRC, "index.html");

const CSS_ORDER = [
  "base.css",        // variables, reset, typography
  "layout.css",      // header, status hero, toolbar, groups, footer
  "cards.css",       // finding cards, evidence, fix
  "components.css",  // toast, thresholds, history, charts, start-here
  "responsive.css",  // mobile breakpoints
  "print.css",       // print styles
];

const JS_ORDER = [
  "dom.js",            // $, esc + shared report state — MUST be first
  "state.js",          // shared constants (SEV, POLL_MS, …)
  "api.js",            // fetchReport/History/Checks, STATIC_DATA flag
  "clipboard.js",      // copyText
  "ui-toast.js",
  "ui-modal.js",       // shared modal shell (checks matrix, help)
  "ui-theme.js",
  "ui-keyboard.js",
  "ui-filters.js",     // activeFilter state + filter/search logic
  "ui-polling.js",     // pollTimer, autoRefresh state
  "ui-notify.js",
  "ui-thresholds.js",
  "ui-history.js",     // statusTimer + trend rendering
  "ui-sidebar.js",     // overview sidebar: breakdown bars + nav counts
  "ui-checks.js",      // all-checks matrix modal + jump-to-finding
  "export.js",
  "render-charts.js",
  "render-findings.js",
  "render-sections.js",
  "render-status.js",
  "render.js",         // render orchestrator
  "init.js",           // entry point (runs at load) — MUST be last
];

function readOrdered(dir, order, ext) {
  const onDisk = readdirSync(dir).filter((f) => f.endsWith(ext));
  const unknown = onDisk.filter((f) => !order.includes(f));
  if (unknown.length) {
    throw new Error(`Unlisted ${ext} file(s) in ${dir}: ${unknown.join(", ")}\nAdd them to the order array in scripts/build-gui.mjs.`);
  }
  const missing = order.filter((f) => !onDisk.includes(f));
  if (missing.length) {
    throw new Error(`Listed ${ext} file(s) missing from ${dir}: ${missing.join(", ")}`);
  }
  return order.map((f) => `/* ── ${f} ── */\n` + readFileSync(join(dir, f), "utf8")).join("\n\n");
}

const css = readOrdered(join(SRC, "css"), CSS_ORDER, ".css");
const js = readOrdered(join(SRC, "js"), JS_ORDER, ".js");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Linux Doctor</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🩺</text></svg>">
<style>
${css}
</style>
</head>
<body>
<a class="skip-link" href="#report">Skip to findings</a>
<div class="wrap">
  <header>
    <span class="logo" aria-hidden="true">🩺</span>
    <div>
      <h1>Linux Doctor</h1>
      <div class="sysinfo" id="sysinfo" role="status">Loading…</div>
    </div>
    <div class="actions">
      <button id="notifybtn" title="Enable desktop notifications when health degrades">🔔</button>
      <button id="theme" title="Toggle theme">🌓</button>
      <button id="export" title="Copy the report as Markdown">⧉ MD</button>
      <button id="copyjson" title="Copy the raw JSON report">{} JSON</button>
      <button id="pdfbtn" title="Export as PDF (print)">⤓ PDF</button>
      <button id="helpbtn" title="Keyboard shortcuts (press ?)">?</button>
      <button id="rerun" class="primary">↻ Re-run checks</button>
    </div>
  </header>
  <div id="status" class="status running" aria-live="polite" role="status">
    <span class="spinner" aria-hidden="true"></span>Reading your system…
  </div>
  <div class="layout">
    <aside id="sidebar" class="sidebar" hidden aria-label="Report overview">
      <section class="sb-block">
        <h2>Why this score</h2>
        <div id="sb-breakdown"></div>
      </section>
      <section class="sb-block">
        <h2>Severity</h2>
        <nav id="sb-sevnav" class="sb-nav"></nav>
      </section>
      <section class="sb-block">
        <h2>Categories</h2>
        <nav id="sb-catnav" class="sb-nav"></nav>
      </section>
    </aside>
    <div class="maincol">
      <div class="toolbar" role="toolbar" aria-label="Report controls">
        <div class="seg" role="group" aria-label="Group findings by">
          <button class="segbtn active" data-groupby="severity">Severity</button>
          <button class="segbtn" data-groupby="category">Category</button>
        </div>
        <div class="filters" id="filters" role="group" aria-label="Severity filter"></div>
        <input id="search" type="search" placeholder="Filter findings…" autocomplete="off" spellcheck="false" aria-label="Filter findings">
        <button id="autorefresh" class="toolbtn on" title="Auto-refresh every 20s">⏱ Auto</button>
        <button id="expandall" class="toolbtn">⊞ Expand all</button>
        <button id="densitybtn" class="toolbtn" title="Toggle compact density" aria-pressed="false">≡</button>
        <button id="checksmatrixbtn" class="toolbtn" title="See every check and its result">☰ Checks</button>
        <button id="clearbtn" class="toolbtn" type="button" disabled>✕ Clear</button>
        <button id="threshbtn" class="toolbtn" title="Edit thresholds">⚙️</button>
      </div>
      <div id="threshpanel" class="thresh-panel" hidden>
        <div class="thresh-head">Thresholds <span class="thresh-sub">— tune when to flag</span> <button id="threshclose" class="toolbtn" style="margin-left:auto; padding:2px 8px;">✕</button></div>
        <div id="threshbody" class="thresh-body"></div>
        <div class="thresh-actions">
          <button id="threshsave" class="primary" style="padding:6px 12px; font-size:12px;">Save</button>
          <button id="threshcopy" class="toolbtn">⧉ Copy JSON</button>
          <span id="threshmsg" style="font-size:11px; color:var(--muted); margin-left:8px;"></span>
        </div>
      </div>
      <main class="content">
        <div id="nexthep" hidden></div>
        <div id="drillhint" class="empty" hidden></div>
        <div id="report" aria-live="polite"><div class="empty">Reading your system…</div></div>
        <div id="nomatch" class="empty" hidden></div>
        <details id="fixed" class="group" hidden>
          <summary>Fixed since last check · <b id="fixed-count"></b><span class="chev">▸</span></summary>
          <div class="group-body" id="fixed-body"></div>
        </details>
        <details id="skipped" class="group" hidden>
          <summary>Skipped checks <b id="skipped-count"></b><span class="chev">▸</span></summary>
          <div class="group-body" id="skipped-body"></div>
        </details>
        <details id="checkerrors" class="group" hidden>
          <summary>Failed checks · <b id="checkerrors-count"></b><span class="chev">▸</span></summary>
          <div class="group-body" id="checkerrors-body"></div>
        </details>
        <details id="diff" class="group" hidden>
          <summary>Changes since last run · <b id="diff-count"></b> <span class="diff-sub">new vs fixed</span><span class="chev">▸</span></summary>
          <div class="group-body" id="diff-body"></div>
        </details>
      </main>
    </div>
  </div>
  <section id="history" class="history" hidden>
    <details class="hist-details">
      <summary class="hist-summary">History <span class="hist-sub">score &amp; findings across recent runs</span><span class="chev">▸</span></summary>
      <div id="trend"></div>
    </details>
  </section>
  <footer>Linux Doctor only reads system information — it never modifies anything.<br><kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> open/close · <kbd>/</kbd> search · <kbd>Esc</kbd> clear</footer>
</div>
<div id="toast-wrap" aria-live="polite" aria-atomic="true"></div>
<div id="modal" class="modal" hidden role="dialog" aria-modal="true" aria-label="Details">
  <div class="modal-card">
    <button id="modal-x" class="modal-x" title="Close (Esc)">✕</button>
    <div id="modal-body"></div>
  </div>
</div>
<script>
${js}
</script>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`✓ Built src-gui/index.html (${html.length} bytes, ${html.split("\n").length} lines)`);
