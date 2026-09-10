import { test } from "node:test";
import assert from "node:assert/strict";
import { pushReport, machineId, validatePushUrl, redactUrl } from "../src/fleet.js";

test("machineId: reads /etc/machine-id or returns null", () => {
  const id = machineId();
  assert.ok(id === null || /^[0-9a-f-]{10,}$/.test(id), "machine id is a hex-ish string or null");
});

test("pushReport: payload carries machineId and the diff fields", async () => {
  let sent = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body) };
    return { ok: true, status: 200 };
  };
  try {
    const diffSinceLast = { added: [{ severity: "high", title: "x" }], fixed: [] };
    await pushReport("https://example.com/reports", { system: {}, findings: [], score: 80, newCount: 1, fixedCount: 0, diffSinceLast }, { apiKey: "k" });
  } finally {
    globalThis.fetch = origFetch;
  }

  assert.equal(sent.url, "https://example.com/reports");
  assert.equal(sent.body.agent, "linux-doctor");
  assert.equal(sent.body.score, 80);
  assert.deepEqual(sent.body.diffSinceLast, { added: [{ severity: "high", title: "x" }], fixed: [] });
  assert.equal(sent.body.machineId, machineId());
  assert.equal(typeof sent.body.hostname, "string");
  assert.match(sent.body.sentAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("pushReport: throws when the server responds with an error", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  try {
    await assert.rejects(() => pushReport("https://example.com/reports", { findings: [] }), /500/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("pushReport: guards against a hung server with a fetch timeout", async () => {
  const origFetch = globalThis.fetch;
  let signal = null;
  globalThis.fetch = async (_url, opts) => {
    signal = opts.signal;
    return { ok: true, status: 200 };
  };
  try {
    await pushReport("https://example.com/reports", { findings: [] });
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.ok(signal instanceof AbortSignal, "fetch must carry an abort signal");
  assert.equal(typeof signal.aborted, "boolean");
});

test("validatePushUrl: clear errors for typos, null for usable URLs", () => {
  assert.match(validatePushUrl("example.com/reports"), /forget https/);
  assert.match(validatePushUrl(""), /requires a URL/);
  assert.match(validatePushUrl("ftp://example.com"), /only http/);
  assert.match(validatePushUrl("https://"), /invalid URL/); // unparseable → the friendly typo hint
  assert.equal(validatePushUrl("https://fleet.example.com/reports"), null);
  assert.equal(validatePushUrl("http://127.0.0.1:8080/push"), null);
});

test("validatePushUrl: refuses plaintext HTTP to non-loopback hosts when an apiKey is set", () => {
  const key = { apiKey: "secret" };
  // HTTPS and loopback stay legal with auth.
  assert.equal(validatePushUrl("https://fleet.example.com/reports", key), null);
  assert.equal(validatePushUrl("http://127.0.0.1:8080/push", key), null);
  assert.equal(validatePushUrl("http://localhost:8080/push", key), null);
  assert.equal(validatePushUrl("http://[::1]:8080/push", key), null);
  // A Bearer token over plaintext HTTP to a real host would be readable in transit.
  assert.match(validatePushUrl("http://fleet.example.com/reports", key), /insecure endpoint/);
  assert.match(validatePushUrl("http://192.168.1.10:8080/push", key), /insecure endpoint/);
  // Without a key, http:// to a real host stays allowed (legacy dev setups).
  assert.equal(validatePushUrl("http://fleet.example.com/reports"), null);
});

test("pushReport: rejects an invalid URL instead of a generic fetch error", async () => {
  await assert.rejects(() => pushReport("notaurl", {}), /invalid URL/);
});

test("pushReport: refuses an insecure HTTP endpoint when auth is configured", async () => {
  await assert.rejects(
    () => pushReport("http://fleet.example.com/reports", { findings: [] }, { apiKey: "secret" }),
    /insecure endpoint/
  );
});

test("validatePushUrl: private/LAN literals require --allow-private-endpoint", () => {
  assert.match(validatePushUrl("https://192.168.1.10:8443/reports"), /private\/LAN/);
  assert.match(validatePushUrl("https://10.0.0.5/x"), /private\/LAN/);
  assert.match(validatePushUrl("https://169.254.169.254/latest"), /private\/LAN/);
  assert.match(validatePushUrl("https://[fd00::1]:8443/x"), /private\/LAN/);
  // Explicit opt-in for a self-hosted LAN server.
  assert.equal(validatePushUrl("https://192.168.1.10:8443/reports", { allowPrivate: true }), null);
  // Loopback and public hosts are unaffected.
  assert.equal(validatePushUrl("http://127.0.0.1:8080/push"), null);
  assert.equal(validatePushUrl("https://fleet.example.com/reports"), null);
});

test("pushReport: refuses to follow redirects", async () => {
  const origFetch = globalThis.fetch;
  let opts = null;
  globalThis.fetch = async (_url, o) => { opts = o; return { ok: true, status: 200 }; };
  try {
    await pushReport("https://example.com/reports", { findings: [] });
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.equal(opts.redirect, "error", "a redirect could bounce the report to an internal target");
});

test("redactUrl: credentials never appear in echoed URLs or errors", () => {
  assert.equal(redactUrl("https://user:pass@host/x"), "https://<redacted>@host/x");
  assert.equal(redactUrl("https://host/x"), "https://host/x");
  const msg = validatePushUrl("http://user:pass@example.com/x", { apiKey: "k" });
  assert.match(msg, /insecure endpoint/);
  assert.ok(!msg.includes("pass"), "the password must not appear in the error");
  assert.match(msg, /<redacted>@/);
});
