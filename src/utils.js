/**
 * Safe, read-only command helpers. Every command Linux Doctor runs is
 * non-destructive: we only inspect, we never modify anything.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

/** Run a read-only shell command. Never returns a thrown error. */
export async function run(cmd, { timeoutMs = 8000 } = {}) {
  try {
    const { stdout, stderr } = await execP(cmd, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, code: 0, stdout, stderr };
  } catch (err) {
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

export function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
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
