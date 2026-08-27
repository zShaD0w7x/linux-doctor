import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { shouldAlert, buildAlert, sendAlert } from "../src/alert.js";

test("shouldAlert: false for a clean report", () => {
  const report = { findings: [{ severity: "info", isNew: false }] };
  assert.equal(shouldAlert(report), false);
});

test("shouldAlert: true when any high-severity finding exists", () => {
  assert.equal(shouldAlert({ findings: [{ severity: "high", isNew: false }] }), true);
});

test("shouldAlert: true when a medium finding is new", () => {
  assert.equal(shouldAlert({ findings: [{ severity: "medium", isNew: true }] }), true);
});

test("shouldAlert: false for a pre-existing medium", () => {
  assert.equal(shouldAlert({ findings: [{ severity: "medium", isNew: false }] }), false);
});

test("buildAlert: carries only actionable findings plus machine context", () => {
  const report = {
    score: 55,
    counts: { high: 1, medium: 1, info: 3 },
    newCount: 1,
    findings: [
      { code: "disk/full", severity: "high", title: "Disk is full", isNew: true },
      { code: "suspend/failed", severity: "medium", title: "Suspend fails", isNew: true },
      { code: "journal/unknown", severity: "info", title: "Log noise", isNew: false },
      { code: "load/ok", severity: "info", title: "Fine", isNew: false },
    ],
  };
  const p = buildAlert(report);
  assert.equal(p.event, "linux-doctor-alert");
  assert.equal(p.score, 55);
  assert.equal(p.newCount, 1);
  assert.deepEqual(p.counts, { high: 1, medium: 1, info: 3 });
  assert.equal(p.findings.length, 2, "only high or new-medium findings go in the alert");
  assert.equal(p.findings[0].code, "disk/full");
  assert.equal(typeof p.hostname, "string");
  assert.ok("machineId" in p);
  assert.ok(p.sentAt);
});

test("sendAlert: posts the payload and reports HTTP errors", async () => {
  let body = null;
  const server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      body = JSON.parse(b);
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/hook`;
  try {
    await sendAlert(url, { event: "linux-doctor-alert", n: 1 });
    assert.equal(body.event, "linux-doctor-alert");
    assert.equal(body.n, 1);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("sendAlert: throws on a non-2xx response", async () => {
  const server = createServer((req, res) => {
    res.statusCode = 500;
    res.end("boom");
  });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/hook`;
  try {
    await assert.rejects(() => sendAlert(url, { event: "x" }), /responded 500/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("sendAlert: refuses plaintext HTTP to a non-loopback host when auth is set", async () => {
  await assert.rejects(
    () => sendAlert("http://example.com/hook", { event: "x" }, { apiKey: "secret" }),
    /insecure endpoint/
  );
  // Loopback stays fine with auth (matches the fleet guard).
  const server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise((r) => server.listen(0, r));
  const loop = `http://127.0.0.1:${server.address().port}/hook`;
  try {
    await sendAlert(loop, { event: "x" }, { apiKey: "secret" });
  } finally {
    await new Promise((r) => server.close(r));
  }
});