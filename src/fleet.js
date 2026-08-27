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
 * Hosts where plaintext HTTP is still acceptable: loopback endpoints never
 * leave the machine, so a local dev/test server stays legal with or without
 * auth. Anything else over http:// puts the report (and the Bearer token) on
 * the wire in the clear.
 */
const PLAINTEXT_OK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Validate a fleet endpoint URL up front, so a typo fails with a clear
 * message instead of a generic fetch error three steps into the run.
 * Only http(s) is accepted — the client never POSTs a report anywhere else.
 * When `apiKey` is set, plain HTTP is refused for every non-loopback host:
 * the Authorization header would be readable by anything between here and
 * the endpoint. Returns an error string, or null when the URL is usable.
 * Pure, exported for tests and reused by --push and --alert.
 */
export function validatePushUrl(url, { apiKey } = {}) {
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
  // Node keeps the brackets on IPv6 hostnames ("[::1]"); strip them for the
  // loopback comparison, same as the dashboard server's origin check.
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (apiKey && parsed.protocol === "http:" && !PLAINTEXT_OK_HOSTS.has(host)) {
    return `insecure endpoint "${url}" — FLEET_API_KEY is set and would travel unencrypted over HTTP; use https:// (loopback URLs are exempt)`;
  }
  return null;
}

/**
 * POST a report to a fleet endpoint. The payload carries a stable machineId
 * and, when the client has history, the diffSinceLast so a fleet dashboard
 * can show what changed on each machine without recomputing it.
 * Returns the server response; throws on network or HTTP errors.
 */
export async function pushReport(url, data, { apiKey } = {}) {
  const err = validatePushUrl(url, { apiKey });
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
