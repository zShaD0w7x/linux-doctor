/**
 * Pro alerting: after a run, POST a compact alert to a webhook when the
 * machine degrades (any high-severity finding, or a new medium/high since the
 * previous run). Self-hosted: point it at ntfy.sh, Slack's incoming webhook,
 * a Home Assistant automation, or your own server. Read-only; never blocks a
 * run (the caller treats failures as warnings).
 */
import os from "node:os";

import { machineId, validatePushUrl } from "./fleet.js";
import { scrub } from "./support.js";

/** True when the report has something worth waking a human about. */
export function shouldAlert(report) {
  return (
    report.findings.some((f) => f.severity === "high") ||
    report.findings.some((f) => f.isNew && (f.severity === "high" || f.severity === "medium"))
  );
}

/** The compact payload sent to the webhook. `hostname` and `machineId` are
 *  deliberate identity (an alert is about a specific machine); the finding
 *  titles are scrubbed, because webhooks are often public (ntfy.sh). */
export function buildAlert(report) {
  return {
    event: "linux-doctor-alert",
    hostname: os.hostname(),
    machineId: machineId(),
    score: report.score,
    counts: report.counts,
    newCount: report.newCount,
    sentAt: new Date().toISOString(),
    findings: report.findings
      .filter((f) => f.severity === "high" || (f.isNew && f.severity === "medium"))
      .map((f) => ({ code: f.code, severity: f.severity, title: scrub(f.title) ?? f.title, isNew: !!f.isNew })),
  };
}

/** POST the alert. Throws on network or HTTP errors. */
export async function sendAlert(url, payload, { apiKey, allowPrivate = false } = {}) {
  // Same guard as --push: a Bearer token must never travel over plaintext
  // HTTP to a non-loopback host, and private/LAN targets need an opt-in.
  const err = validatePushUrl(url, { apiKey, allowPrivate });
  if (err) throw new Error(err.replace(/^--push /, ""));
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10000),
    redirect: "error",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`alert webhook responded ${res.status}`);
  return res;
}