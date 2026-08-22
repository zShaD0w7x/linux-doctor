/**
 * Safe, read-only command helpers. Every command Linux Doctor runs is
 * non-destructive: we only inspect, we never modify anything.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

/** Named timeouts for slow system tools, shared by the checks that spawn them. */
export const TIMEOUT_MS = {
  DEFAULT: 8000,
  SMART: 10000, // smartctl -H per device
  JOURNAL: 15000, // journalctl --disk-usage
  PKGMGR: 20000, // apt-get/dnf/zypper/apk/pacman update enumeration
  OSTREE: 30000, // rpm-ostree upgrade --check
  DAEMON: 30000, // fwupdmgr, flatpak (both can block on a daemon)
};

/**
 * Run a read-only shell command. Never returns a thrown error.
 *
 * Every command runs with a pinned `LC_ALL=C` locale: system tools (free, df,
 * ps, journalctl, …) localize their headers and numbers, and the checks parse
 * that output ("Mem:", "Filesystem", "1,2G"). Without a pinned locale a German
 * `free` prints "Speicher:" and a check silently finds nothing.
 *
 * `maxBuffer` is the capture ceiling for stdout. Exceeding it kills the child
 * and is reported as `truncated: true` — distinct from a timeout, which is a
 * slow command, and from a missing binary, which is `missing: true`. Callers
 * decide whether partial stdout is still usable.
 */
export async function run(cmd, { timeoutMs = TIMEOUT_MS.DEFAULT, maxBuffer = 4 * 1024 * 1024, env } = {}) {
  try {
    const { stdout, stderr } = await execP(cmd, {
      timeout: timeoutMs,
      maxBuffer,
      env: { ...process.env, LC_ALL: "C", ...env },
    });
    return { ok: true, code: 0, stdout, stderr };
  } catch (err) {
    // maxBuffer exceeded: the child was killed for producing too much output.
    // Checked BEFORE `killed` — a maxBuffer kill also sets killed=true, but it
    // is data loss, not a timeout.
    if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return { ok: false, code: -2, stdout: err.stdout || "", stderr: err.stderr || "", truncated: true };
    }
    // exec kills the child when it exceeds the timeout — a killed process
    // means the command hung, not that it failed, and callers need to tell
    // the two apart (a timeout is not evidence the check "ran fine").
    if (err.killed === true) {
      return { ok: false, code: 1, stdout: err.stdout || "", stderr: err.stderr || "", timedOut: true };
    }
    if (err.code === "ENOENT" || (err.message && err.message.includes("spawn"))) {
      return { ok: false, code: -1, stdout: "", stderr: "", missing: true };
    }
    return {
      ok: false,
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout || "",
      stderr: err.stderr || "",
    };
  }
}

export function lines(text) {
  return String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Extract real journal entries from journalctl output. journalctl prints
 * "-- Boot ... --" boot separators and "-- No entries --" lines that are not
 * log entries and must never be counted as findings; every check that reads
 * the journal strips them the same way. Returns the last `tail` lines when set.
 */
export function journalLines(stdout, { tail } = {}) {
  const all = lines(stdout).filter((l) => !l.startsWith("-- "));
  return tail ? all.slice(-tail) : all;
}

export function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Parse "3.2G", "512.0M", "1024B" into a byte count (0 when unparseable). */
export function parseSize(text) {
  const m = String(text || "").match(/([\d.]+)\s*([KMGTP]?B?)/i);
  if (!m) return 0;
  const unit = (m[2] || "").replace("B", "").toUpperCase() || "B";
  const mult = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[unit] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

export function pct(value) {
  return num(String(value).replace("%", ""));
}

/** Format bytes as a friendly string, e.g. "2.3 GB". */
export function fmtBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** "1 update" / "3 updates" — picks the plural form from a count. */
export function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Quote a value for safe interpolation into a shell command string. Values we
 * interpolate (device names, unit names, mount points) come from parsing
 * other tools' output, so a crafted name must never be able to break out of
 * its argument and run arbitrary commands. Single-quoting with the '\'' escape
 * is POSIX-safe: every other character loses its special meaning inside quotes.
 */
export function shq(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/** "System is low on usable memory" → "system-is-low-on-usable-memory". */
export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Run `worker(item)` over `items` with at most `limit` workers in flight.
 * Results come back in input order. Used to bound how many checks (and thus
 * subprocesses) run at once — a full run would otherwise spawn dozens of
 * commands simultaneously.
 */
export async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const take = () => {
    const i = next;
    next += 1;
    return i;
  };
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = take();
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}
