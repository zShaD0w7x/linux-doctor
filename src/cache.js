/**
 * Tiny TTL cache for slow checks — currently the `updates` check, whose dnf
 * metadata refresh takes seconds. Cache is a bonus, never a dependency: if
 * the file cannot be read or written, checks simply run uncached.
 *
 * Location: ~/.cache/linux-doctor/<key>.json (override LINUX_DOCTOR_CACHE).
 * Each cache entry is { at: ISO timestamp, findings: [...] }. All env and
 * HOME reads happen at call time so tests can redirect the cache per run.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { atomicWrite } from "./fsx.js";
import { cacheDir } from "./paths.js";

export { cacheDir };

export function cacheFile(key) {
  return join(cacheDir(), `${key}.json`);
}

/** Cached findings when fresh; null when absent, stale, or corrupt. */
export function readCache(key, maxAgeMs) {
  try {
    const data = JSON.parse(readFileSync(cacheFile(key), "utf8"));
    if (!data || !Array.isArray(data.findings)) return null;
    const age = Date.now() - new Date(data.at).getTime();
    if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
    return data.findings;
  } catch {
    return null;
  }
}

/** Persist findings under key. Returns false on any failure (never throws). */
export function writeCache(key, findings) {
  return atomicWrite(cacheFile(key), JSON.stringify({ at: new Date().toISOString(), findings }));
}
