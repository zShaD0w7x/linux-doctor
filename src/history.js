/**
 * Report history and health score.
 *
 * Every run is appended to a small JSON file (default:
 * ~/.local/share/linux-doctor/history.json, override with LINUX_DOCTOR_HISTORY)
 * so we can show a health score, "new since last check", and a trend over
 * time. History is a bonus, never a dependency: if the file cannot be read or
 * written, every function here fails silently.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { historyFile } from "./paths.js";
import { SEV_PENALTY, SEV_ESCALATION, SEV_ESCALATE_FROM, SEV_ORDER } from "./severities.js";

export { historyFile };

/** Keep only this many runs so the history file stays tiny. */
export const HISTORY_LIMIT = 50;

/**
 * 0-100 health score: start at 100 and subtract the configured penalty per
 * finding (15 per high-severity, 8 per medium-severity), floor at 0.
 * Informational findings are free. Penalties live in src/severities.js.
 *
 * Problems compound, so penalties escalate within a tier (see SEV_ESCALATION):
 * the n-th high costs 15 + 5·(n−1) — four criticals must not land near a pile
 * of annoyances — and mediums past the third cost +1 each. The formula is a
 * closed form over per-tier counts, so the score never depends on input order.
 */
export function score(findings) {
  let penalty = 0;
  for (const sev of SEV_ORDER) {
    const n = findings.reduce((acc, f) => acc + (f.severity === sev ? 1 : 0), 0);
    if (n === 0) continue;
    const base = SEV_PENALTY[sev] ?? 0;
    const step = SEV_ESCALATION[sev] ?? 0;
    const from = SEV_ESCALATE_FROM[sev] ?? Number.POSITIVE_INFINITY;
    // Extra findings (ordinal ≥ `from`) pay base + growing surcharge:
    // sum over k = from..n of step·(k − from + 1) = step · m(m+1)/2, m = n−from+1.
    const m = Math.max(0, n - from + 1);
    penalty += n * base + step * ((m * (m + 1)) / 2);
  }
  return Math.max(0, 100 - penalty);
}

/** Load the list of past runs (oldest first). Never throws. */
export function loadHistory(file = historyFile()) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed && Array.isArray(parsed.runs)) return parsed.runs;
  } catch {
    /* missing or corrupt file — treat as no history */
  }
  return [];
}

/**
 * Append a run to the history file. Never throws. Written via a temp file +
 * rename so a crash mid-write can never leave a truncated history behind.
 */
export function saveRun(run, file = historyFile()) {
  try {
    const runs = loadHistory(file);
    runs.push(run);
    const trimmed = runs.slice(-HISTORY_LIMIT);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ runs: trimmed }, null, 2) + "\n");
    renameSync(tmp, file); // atomic on POSIX: readers see old or new, never partial
  } catch {
    try {
      rmSync(`${file}.tmp`, { force: true });
    } catch {
      /* ignore cleanup failures */
    }
    /* history is optional — never fail a check run because of it */
  }
}

/** Score of the most recent previous run, or null when there is no history. */
export function previousScore(runs) {
  const prev = runs[runs.length - 1];
  if (!prev || typeof prev.score !== "number") return null;
  return prev.score;
}

/**
 * Stable identity of a finding for history diffing: its explicit `code` when
 * one exists, otherwise the title. Matching by code matters because many
 * titles embed a volatile count ("3 services failed" → "2 services failed")
 * — comparing titles alone would mark the same issue as new + fixed on every
 * run. Older history entries predate `code`, so title stays as the fallback.
 */
function findingKey(f) {
  return f && typeof f.code === "string" && f.code !== "" ? f.code : f.title;
}

/**
 * Findings whose identity did not appear in the most recent previous run.
 * Returns the full finding objects so callers can badge them.
 */
export function newFindings(findings, runs) {
  const prev = runs[runs.length - 1];
  if (!prev || !Array.isArray(prev.findings)) return [];
  const prevKeys = new Set(prev.findings.map(findingKey));
  return findings.filter((f) => !prevKeys.has(findingKey(f)));
}

/**
 * What changed since the most recent previous run, compared by stable key
 * (code when present, else title): `added` = findings present now but not
 * before, `fixed` = findings present before but gone now, `unchanged` = the
 * number of current findings whose key also appeared in the previous run (so
 * the three counts sum to the current finding total). The keyed objects keep
 * the stable identity so callers can badge current findings without
 * recomputing it.
 */
export function diffSinceLast(findings, runs) {
  const prev = runs[runs.length - 1];
  if (!prev || !Array.isArray(prev.findings)) return { added: [], fixed: [], unchanged: findings.length };
  const prevKeys = new Set(prev.findings.map(findingKey));
  const curKeys = new Set(findings.map(findingKey));
  return {
    added: findings.filter((f) => !prevKeys.has(findingKey(f))).map((f) => ({ code: findingKey(f), severity: f.severity, title: f.title })),
    fixed: prev.findings.filter((f) => !curKeys.has(findingKey(f))).map((f) => ({ code: findingKey(f), severity: f.severity, title: f.title })),
    unchanged: findings.filter((f) => prevKeys.has(findingKey(f))).length,
  };
}

/**
 * One human sentence summarizing the change since the last run, used
 * consistently in the CLI, JSON, and the dashboard. Returns null when there is
 * nothing to say (first run, history disabled, or no change) so callers can
 * render it conditionally and never print an empty "Since last run: ".
 */
export function changeMessage({ newCount = 0, fixedCount = 0 } = {}) {
  if (newCount <= 0 && fixedCount <= 0) return null;
  const parts = [];
  if (newCount > 0) parts.push(`${newCount} new issue${newCount === 1 ? "" : "s"}`);
  if (fixedCount > 0) parts.push(`${fixedCount} fixed`);
  return `Since last run: ${parts.join(", ")}.`;
}

/**
 * Whether history is explicitly turned off. `LINUX_DOCTOR_NO_HISTORY=1` is the
 * env override (handy in CI/cron where a writable data dir may not exist); the
 * CLI `--no-history` flag is OR-ed in by the caller. When disabled, runs are
 * neither read for diffing nor written — new/fixed tracking is simply silent.
 */
export function isHistoryDisabled({ cliFlag = false } = {}) {
  return cliFlag || /^(1|true|yes)$/i.test(process.env.LINUX_DOCTOR_NO_HISTORY || "");
}
