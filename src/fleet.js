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
 * Non-loopback addresses that a misconfigured or attacker-influenced endpoint
 * could use to reach internal services: RFC1918, link-local (incl. the cloud
 * metadata address), CGNAT, and the IPv6 link-local/ULA ranges. Loopback is
 * deliberately NOT here — a local dev/test server stays legal as before; the
 * protection is against a report (and a Bearer token) being sent to some
 * other host on the LAN or inside a network. Only literal addresses and
 * IP-shaped hostnames are caught synchronously; a name that resolves to a
 * private IP is out of scope for this pure check (documented).
 */
const PRIVATE_IPV4 = /^(?:10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
const PRIVATE_IPV6 = /^(?:fe80|fec0|fc|fd)[0-9a-f:]*$/;

function isPrivateLiteral(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return PRIVATE_IPV4.test(h) || PRIVATE_IPV6.test(h);
}

/**
 * Validate a fleet endpoint URL up front, so a typo fails with a clear
 * message instead of a generic fetch error three steps into the run.
 * Only http(s) is accepted — the client never POSTs a report anywhere else.
 * When `apiKey` is set, plain HTTP is refused for every non-loopback host:
 * the Authorization header would be readable by anything between here and
 * the endpoint. Private/LAN literals are refused unless `allowPrivate` is
 * set (self-hosted servers are legitimate — but opting in must be explicit).
 * Returns an error string, or null when the URL is usable.
 * Pure, exported for tests and reused by --push, --alert and --heartbeat.
 */
export function validatePushUrl(url, { apiKey, allowPrivate = false } = {}) {
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
  if (!allowPrivate && isPrivateLiteral(host)) {
    return `endpoint "${url}" points at a private/LAN address — pass --allow-private-endpoint if this is a self-hosted server on your network`;
  }
  return null;
}

/**
 * POST a report to a fleet endpoint. The payload carries a stable machineId
 * and, when the client has history, the diffSinceLast so a fleet dashboard
 * can show what changed on each machine without recomputing it.
 * Returns the server response; throws on network or HTTP errors.
 */
export async function pushReport(url, data, { apiKey, allowPrivate = false } = {}) {
  const err = validatePushUrl(url, { apiKey, allowPrivate });
  if (err) throw new Error(err.replace(/^--push /, "")); // defense in depth; CLI validates earlier
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10000),
    // A redirect could bounce an allowed URL onto an internal target (SSRF);
    // reports go exactly where the user pointed them, or nowhere.
    redirect: "error",
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
