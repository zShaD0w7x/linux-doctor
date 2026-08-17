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

/**
 * Findings whose title did not appear in the most recent previous run.
 * Returns the full finding objects so callers can badge them.
 */
export function newFindings(findings, runs) {
  const prev = runs[runs.length - 1];
  if (!prev || !Array.isArray(prev.findings)) return [];
  const prevTitles = new Set(prev.findings.map((f) => f.title));
  return findings.filter((f) => !prevTitles.has(f.title));
}

/**
 * What changed since the most recent previous run, compared by title:
 * `added` = findings present now but not before, `fixed` = findings present
 * before but gone now (the title's own severity is kept for both sides).
 */
export function diffSinceLast(findings, runs) {
  const prev = runs[runs.length - 1];
  if (!prev || !Array.isArray(prev.findings)) return { added: [], fixed: [] };
  const prevTitles = new Set(prev.findings.map((f) => f.title));
  const curTitles = new Set(findings.map((f) => f.title));
  return {
    added: findings.filter((f) => !prevTitles.has(f.title)).map((f) => ({ severity: f.severity, title: f.title })),
    fixed: prev.findings.filter((f) => !curTitles.has(f.title)).map((f) => ({ severity: f.severity, title: f.title })),
  };
}
