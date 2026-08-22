/**
 * Fleet reporting (enterprise): push a report to a central server so
 * companies can collect health data from many machines in one place.
 * The hosted dashboard is the paid service; this client is free and open.
 */
import os from "node:os";
import { readFileSync } from "node:fs";

/** Stable per-machine id from /etc/machine-id (null when unreadable). */
export function machineId() {
  try {
    const id = readFileSync("/etc/machine-id", "utf8").trim();
    return id || null;
  } catch {
    return null;
  }
}

/**
 * Validate a fleet endpoint URL up front, so a typo fails with a clear
 * message instead of a generic fetch error three steps into the run.
 * Only http(s) is accepted — the client never POSTs a report anywhere else.
 * Returns an error string, or null when the URL is usable. Pure, exported
 * for tests and reused by --push and --daemon.
 */
export function validatePushUrl(url) {
  if (!url || typeof url !== "string" || url.trim() === "") return "--push requires a URL";
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return `invalid URL "${url}" — did you forget https:// ?`;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return `invalid URL "${url}" — only http:// and https:// endpoints are supported`;
  }
  if (!parsed.hostname) return `invalid URL "${url}" — missing host name`;
  return null;
}

/**
 * POST a report to a fleet endpoint. The payload carries a stable machineId
 * and, when the client has history, the diffSinceLast so a fleet dashboard
 * can show what changed on each machine without recomputing it.
 * Returns the server response; throws on network or HTTP errors.
 */
export async function pushReport(url, data, { apiKey } = {}) {
  const err = validatePushUrl(url);
  if (err) throw new Error(err.replace(/^--push /, "")); // defense in depth; CLI validates earlier
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      ...data,
      agent: "linux-doctor",
      hostname: os.hostname(),
      machineId: machineId(),
      sentAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`fleet server responded ${res.status}`);
  return res;
}
