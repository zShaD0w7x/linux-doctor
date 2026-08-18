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
 * POST a report to a fleet endpoint. The payload carries a stable machineId
 * and, when the client has history, the diffSinceLast so a fleet dashboard
 * can show what changed on each machine without recomputing it.
 * Returns the server response; throws on network or HTTP errors.
 */
export async function pushReport(url, data, { apiKey } = {}) {
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
