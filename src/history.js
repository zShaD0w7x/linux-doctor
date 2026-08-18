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
import { dirname, join } from "node:path";

/** Keep only this many runs so the history file stays tiny. */
export const HISTORY_LIMIT = 50;

/**
 * 0-100 health score: start at 100, subtract 15 per high-severity and 8 per
 * medium-severity finding, floor at 0. Informational findings do not count.
 */
export function score(findings) {
  const high = findings.filter((f) => f.severity === "high").length;
  const med = findings.filter((f) => f.severity === "medium").length;
  return Math.max(0, 100 - high * 15 - med * 8);
}

/** Path of the history file. */
export function historyFile() {
  if (process.env.LINUX_DOCTOR_HISTORY) return process.env.LINUX_DOCTOR_HISTORY;
  const base = process.env.XDG_DATA_HOME || join(process.env.HOME || ".", ".local", "share");
  return join(base, "linux-doctor", "history.json");
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
 * before, `fixed` = findings present before but gone now. The key is kept in
 * the result so callers can badge current findings without recomputing it.
 */
export function diffSinceLast(findings, runs) {
  const prev = runs[runs.length - 1];
  if (!prev || !Array.isArray(prev.findings)) return { added: [], fixed: [] };
  const prevKeys = new Set(prev.findings.map(findingKey));
  const curKeys = new Set(findings.map(findingKey));
  return {
    added: findings.filter((f) => !prevKeys.has(findingKey(f))).map((f) => ({ code: findingKey(f), severity: f.severity, title: f.title })),
    fixed: prev.findings.filter((f) => !curKeys.has(findingKey(f))).map((f) => ({ code: findingKey(f), severity: f.severity, title: f.title })),
  };
}
