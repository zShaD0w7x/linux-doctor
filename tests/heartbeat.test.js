import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { pingHeartbeat } from "../src/heartbeat.js";
import { parseArgs } from "../src/args.js";

const parse = (...flags) => parseArgs(["node", "bin/doctor.js", ...flags]);

function echoServer(status = 200) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method, url: req.url });
    res.writeHead(status, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, hits, port: server.address().port }));
  });
}

test("pingHeartbeat: pings with a bare GET and no body", async () => {
  const { server, hits, port } = await echoServer(200);
  try {
    await pingHeartbeat(`http://127.0.0.1:${port}/ping-key`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].method, "GET");
    assert.equal(hits[0].url, "/ping-key");
  } finally {
    server.close();
  }
});

test("pingHeartbeat: throws on HTTP errors and unreachable hosts", async () => {
  const { server, port } = await echoServer(500);
  try {
    await assert.rejects(pingHeartbeat(`http://127.0.0.1:${port}/x`), /responded 500/);
  } finally {
    server.close();
  }
  await assert.rejects(pingHeartbeat("http://127.0.0.1:1/unreachable"), /fetch failed|ECONNREFUSED/);
});

test("pingHeartbeat: mistyped URLs fail fast with a clear message", async () => {
  await assert.rejects(pingHeartbeat("not-a-url"), /forget https/);
  await assert.rejects(pingHeartbeat("gopher://example.com/x"), /only http/);
});

test("parseArgs: --heartbeat captures its URL and requires a value", () => {
  assert.equal(parse("--heartbeat", "https://hc-ping.com/abc").heartbeatUrl, "https://hc-ping.com/abc");
  assert.equal(parse("--heartbeat=https://hc-ping.com/abc").heartbeatUrl, "https://hc-ping.com/abc");
  assert.match(parse("--heartbeat").error, /--heartbeat requires a value/);
});
