import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

export const SEV_ORDER = ["high", "medium", "info"];
export const SEV_LABEL = {
  high: "🔴 HIGH",
  medium: "🟡 MEDIUM",
  info: "⚪ INFO",
};

/** ANSI color codes — only used when stdout is a TTY, never in --plain. */
const A = { red: "\x1b[31m", yellow: "\x1b[33m", blue: "\x1b[34m", cyan: "\x1b[36m", bold: "\x1b[1m", dim: "\x1b[2m", reset: "\x1b[0m" };
const SEV_COLOR = { high: A.red, medium: A.yellow, info: A.blue };
const isTTY = process.stdout?.isTTY;

export function countBySeverity(findings) {
  return SEV_ORDER.map((s) => ({ severity: s, count: findings.filter((f) => f.severity === s).length }));
}

/** Render the full terminal report in American English. */
export async function renderReport(findings, { aiSummary, system, score, newCount, fixedCount, ignoredCount = 0, checkErrors = [], checksRun, checksSkipped } = {}) {
  // system is required — the caller (cli.js) always has it; re-running
  // systemInfo() here would waste a handful of subprocess spawns.
  const info = system;
  const out = [];

  out.push("🩺 Linux Doctor");
  out.push("==============");
  out.push(`System: ${info.distro} · Kernel ${info.kernel} · ${info.cores} core(s) · up ${info.uptime}`);
  if (info.immutable) out.push("Note: this is an immutable (ostree) system; the root filesystem is virtual, so a 100% root is expected and normal.");
  out.push("");

  if (aiSummary) {
    out.push(aiSummary);
    out.push("");
  }

  const counts = countBySeverity(findings);
  const high = counts.find((c) => c.severity === "high").count;
  const med = counts.find((c) => c.severity === "medium").count;
  const inf = counts.find((c) => c.severity === "info").count;

  if (high === 0 && med === 0) {
    out.push("✅ Your system looks healthy. No high or medium issues found.");
  } else {
    out.push(`Found ${high} high-severity, ${med} medium-severity, and ${inf} informational finding(s).`);
  }
  if (typeof score === "number") {
    out.push(`Health score: ${score}/100`);
  }
  if (newCount > 0) {
    out.push(`${newCount} new issue(s) since the last check.`);
  }
  if (fixedCount > 0) {
    out.push(`${fixedCount} issue(s) fixed since the last check — nice work.`);
  }
  if (ignoredCount > 0) {
    out.push(`${ignoredCount} finding(s) hidden by your ignore patterns.`);
  }
  if (checkErrors.length > 0) {
    out.push(`⚠ ${checkErrors.length} check(s) failed to run: ${checkErrors.map((e) => e.check).join(", ")}.`);
  }
  if (typeof checksRun === "number") {
    const bits = [`Ran ${checksRun} check(s)`];
    if (checksSkipped > 0) bits.push(`${checksSkipped} skipped`);
    if (checkErrors.length > 0) bits.push(`${checkErrors.length} failed`);
    out.push(bits.length > 1 ? `${bits[0]} (${bits.slice(1).join(", ")}).` : `${bits[0]}.`);
  }
  out.push("");

  let n = 0;
  for (const sev of SEV_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    const label = SEV_LABEL[sev];
    out.push(isTTY ? `${SEV_COLOR[sev]}${A.bold}${label}${A.reset}` : label);
    out.push("-".repeat(label.length));
    for (const f of group) {
      n += 1;
      const badge = f.isNew ? (isTTY ? `${A.bold}${A.cyan}🆕 NEW${A.reset}` : "🆕 NEW") : "";
      out.push("");
      out.push(`${n}. ${f.title}${badge ? `  ${badge}` : ""}`);
      if (f.confidence === "low") out.push("   ⚠ Low confidence — this finding may be a false positive.");
      if (f.detail) out.push(`   ${f.detail}`);
      if (f.evidence) {
        out.push("");
        out.push("   Evidence:");
        for (const line of String(f.evidence).split("\n").slice(0, 8)) out.push(`     $ ${line}`);
      }
      if (f.fix) {
        out.push("");
        out.push(`   How to fix: ${f.fix}`);
      }
      out.push("");
    }
  }

  out.push("──────────────────────────────");
  out.push("Linux Doctor only reads system information — it never modifies anything.");
  out.push("Report bugs or request checks at: github.com/zShaD0w7x/linux-doctor-cli");
  return out.join("\n");
}

/**
 * --todo: a flat, numbered, severity-ordered list of the actionable steps —
 * just the findings that come with a fix. One line per step, copy-pasteable,
 * so a user gets "what do I run, in order" without reading the full report.
 */
export function renderTodo(findings) {
  const out = [];
  out.push("# linux-doctor --todo");
  out.push("# Steps to fix the issues found, in priority order.");
  out.push("");
  let n = 0;
  for (const sev of SEV_ORDER) {
    for (const f of findings.filter((x) => x.severity === sev)) {
      if (!f.fix) continue;
      n += 1;
      out.push(`${n}. [${sev}] ${f.title}`);
      out.push(`   ${f.fix}`);
      out.push("");
    }
  }
  if (n === 0) out.push("Nothing to fix — no findings came with an action.");
  return out.join("\n");
}

/**
 * Render findings as plain, tab-separated lines — no colors, no emoji, no
 * box drawing — so the output plays well with grep/awk and dumb terminals.
 * Metadata goes to `#` comment lines; each finding is one row of
 * `severity<TAB>number<TAB>title`, with `detail`/`fix` rows right after it.
 */
export function renderPlain(findings, { system, score, scoreDelta, newCount, fixedCount, ignoredCount = 0, checkErrors = [], checksRun, checksSkipped } = {}) {
  const flat = (s) => String(s ?? "").replace(/\t/g, " ").replace(/\s*\n\s*/g, " | ").trim();
  const out = [];
  out.push("# linux-doctor");
  if (system) out.push(`# system: ${system.distro} · kernel ${system.kernel} · ${system.cores} core(s) · up ${system.uptime}`);
  if (typeof score === "number") {
    const delta = typeof scoreDelta === "number" ? (scoreDelta >= 0 ? ` (+${scoreDelta})` : ` (${scoreDelta})`) : "";
    out.push(`# score: ${score}/100${delta}`);
  }
  if (newCount > 0) out.push(`# new: ${newCount}`);
  if (fixedCount > 0) out.push(`# fixed: ${fixedCount}`);
  if (ignoredCount > 0) out.push(`# ignored: ${ignoredCount}`);
  if (typeof checksRun === "number") out.push(`# checks: ${checksRun}${checksSkipped > 0 ? ` (${checksSkipped} skipped)` : ""}`);
  for (const e of checkErrors) out.push(`# failed: ${e.check} — ${flat(e.error)}`);
  const counts = countBySeverity(findings);
  const high = counts.find((c) => c.severity === "high").count;
  const med = counts.find((c) => c.severity === "medium").count;
  const inf = counts.find((c) => c.severity === "info").count;
  out.push(`# summary: ${high} high, ${med} medium, ${inf} info`);
  out.push("");

  let n = 0;
  for (const sev of SEV_ORDER) {
    for (const f of findings.filter((x) => x.severity === sev)) {
      n += 1;
      out.push(`${sev}\t${n}\t${flat(f.title)}${f.isNew ? " (new)" : ""}`);
      if (f.detail) out.push(`detail\t${n}\t${flat(f.detail)}`);
      if (f.fix) out.push(`fix\t${n}\t${flat(f.fix)}`);
    }
  }
  return out.join("\n");
}

/**
 * Render findings as JSON (machine-readable), with system info when
 * available. The payload is versioned (schemaVersion) so scripts can rely on
 * its shape; if the shape ever changes incompatibly the version is bumped.
 * `extra` may carry generatedAt (from the run), score, newCount, counts and
 * durationMs — cli.js passes them all.
 */
export function renderJson(findings, system = null, extra = {}) {
  const payload = {
    schemaVersion: 1,
    tool: "linux-doctor",
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    findings,
    ...extra,
  };
  if (system) payload.system = system;
  return JSON.stringify(payload, null, 2);
}
