import { test } from "node:test";
import assert from "node:assert/strict";
import { pushReport, machineId } from "../src/fleet.js";

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
