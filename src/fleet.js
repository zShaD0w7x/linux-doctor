/**
 * Fleet reporting (enterprise): push a report to a central server so
 * companies can collect health data from many machines in one place.
 * The hosted dashboard is the paid service; this client is free and open.
 */
import os from "node:os";

/**
 * POST a report to a fleet endpoint.
 * Returns the server response; throws on network or HTTP errors.
 */
export async function pushReport(url, data, { apiKey } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...data,
      agent: "linux-doctor",
      hostname: os.hostname(),
      sentAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`fleet server responded ${res.status}`);
  return res;
}
