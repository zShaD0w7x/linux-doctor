import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { pushReport } from "../src/fleet.js";

test("pushReport POSTs the report with agent, hostname and auth", async () => {
  let received = null;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received = {
        method: req.method,
        path: req.url,
        body: JSON.parse(body),
        auth: req.headers.authorization,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const res = await pushReport(
      `http://127.0.0.1:${port}/reports`,
      { findings: [{ id: 1, severity: "high" }] },
      { apiKey: "secret" }
    );
    assert.equal(res.status, 200);
    assert.equal(received.method, "POST");
    assert.equal(received.path, "/reports");
    assert.equal(received.auth, "Bearer secret");
    assert.equal(received.body.findings[0].severity, "high");
    assert.equal(received.body.agent, "linux-doctor");
    assert.ok(received.body.hostname, "payload must include the hostname");
    assert.ok(received.body.sentAt, "payload must include a timestamp");
  } finally {
    server.close();
  }
});

test("pushReport throws on a non-2xx response", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(500);
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    await assert.rejects(() => pushReport(`http://127.0.0.1:${port}/reports`, {}), /500/);
  } finally {
    server.close();
  }
});
