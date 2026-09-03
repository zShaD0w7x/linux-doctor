import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { startWeb } from "../src/web.js";

// Raw request helper — fetch() treats Host and Origin as forbidden header
// names, and these tests must control both headers exactly.
function rawRequest(port, path, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

// Is 43901 (the dashboard's default port) currently free? Used to pin the
// default in tests without flaking when a live dashboard is running.
const portFree = (p) =>
  new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(p, "127.0.0.1");
  });

test("web dashboard serves the page and a fresh report via /api/report", async () => {
  const collect = async () => ({
    generatedAt: new Date().toISOString(),
    system: { distro: "Bazzite", kernel: "6.x", cores: "4", uptime: "2h 0m" },
    findings: [
      { id: 1, severity: "high", title: "3 services failed to start", detail: "Some detail.", evidence: "a\tb", fix: "systemctl status x" },
      { id: 2, severity: "info", title: "System is up to date", detail: "No pending updates.", evidence: null, fix: null },
    ],
  });

  const server = await startWeb({ collect, open: false, port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await (await fetch(base + "/")).text();
    assert.match(page, /Linux Doctor/);
    assert.match(page, /api\/report/);
    assert.match(page, /Re-run checks/);

    const data = await (await fetch(base + "/api/report")).json();
    assert.equal(data.findings.length, 2);
    assert.equal(data.findings[0].severity, "high");
    assert.equal(data.system.distro, "Bazzite");
  } finally {
    server.close();
  }
});

test("web /api/report can serve the versioned --json envelope via render", async () => {
  const collect = async () => ({
    generatedAt: new Date().toISOString(),
    system: { distro: "Bazzite", kind: "desktop" },
    findings: [{ id: 1, severity: "info", title: "All good", check: "memory", code: "memory/all-good" }],
  });
  // Like cli.js does with renderJson: the render function returns a JSON
  // string, and the server must pass it through without double-encoding.
  const render = (d) => JSON.stringify({ schemaVersion: 1, tool: "linux-doctor", version: "0.3.0", ...d });
  const server = await startWeb({ collect, render, open: false, port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const data = await (await fetch(base + "/api/report")).json();
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.tool, "linux-doctor");
    assert.equal(data.findings[0].check, "memory");
  } finally {
    server.close();
  }
});

test("web dashboard serves run history via /api/history", async () => {
  const history = () => [{ at: "2026-08-15T00:00:00Z", score: 85 }, { at: "2026-08-16T00:00:00Z", score: 69 }];
  const server = await startWeb({ collect: async () => ({ findings: [] }), history, open: false, port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = await (await fetch(base + "/api/history")).json();
    assert.equal(body.runs.length, 2);
    assert.equal(body.runs[1].score, 69);
  } finally {
    server.close();
  }
});

test("web dashboard defaults to port 43901 and falls back when it is taken", async () => {
  const collect = async () => ({ findings: [] });
  const first = await startWeb({ collect, open: false, quiet: true });
  const second = await startWeb({ collect, open: false, quiet: true });
  try {
    if (await portFree(43901)) {
      assert.equal(first.address().port, 43901, "default port is 43901 when free");
    }
    assert.notEqual(second.address().port, first.address().port, "second instance falls back to another port");
    const ok = await (await fetch(`http://127.0.0.1:${second.address().port}/api/report`)).ok;
    assert.ok(ok, "fallback server still serves the report");
  } finally {
    first.close();
    second.close();
  }
});

test("POST /api/ignore writes the pattern to the config file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-web-"));
  const config = join(dir, "config.json");
  const prev = process.env.LINUX_DOCTOR_CONFIG;
  process.env.LINUX_DOCTOR_CONFIG = config;
  try {
    const server = await startWeb({ collect: async () => ({ findings: [] }), open: false, port: 0, quiet: true });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const res = await fetch(base + "/api/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: "Suspend hooks are failing" }),
      });
      assert.equal(res.status, 200);
      const saved = JSON.parse(readFileSync(config, "utf8"));
      assert.deepEqual(saved.ignore, ["Suspend hooks are failing"]);
    } finally {
      server.close();
    }
  } finally {
    if (prev === undefined) delete process.env.LINUX_DOCTOR_CONFIG;
    else process.env.LINUX_DOCTOR_CONFIG = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("web rejects non-loopback Host headers (DNS rebinding)", async () => {
  const server = await startWeb({ collect: async () => ({ findings: [] }), open: false, port: 0, quiet: true });
  try {
    // An attacker page whose domain rebinds to 127.0.0.1 arrives with an
    // attacker-chosen Host header — it must not be served.
    const rebound = await rawRequest(server.address().port, "/", { headers: { Host: "evil.example" } });
    assert.equal(rebound.status, 403);
    const report = await rawRequest(server.address().port, "/api/report", { headers: { Host: "evil.example" } });
    assert.equal(report.status, 403);
    // A normal loopback visit keeps working.
    const local = await rawRequest(server.address().port, "/");
    assert.equal(local.status, 200);
  } finally {
    server.close();
  }
});

test("web rejects cross-origin POSTs to config-writing endpoints (CSRF)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-web-csrf-"));
  const prev = process.env.LINUX_DOCTOR_CONFIG;
  process.env.LINUX_DOCTOR_CONFIG = join(dir, "config.json");
  try {
    const server = await startWeb({ collect: async () => ({ findings: [] }), open: false, port: 0, quiet: true });
    const port = server.address().port;
    try {
      // A forged cross-site POST always carries the attacker's Origin.
      const body = JSON.stringify({ pattern: "Suspend hooks are failing" });
      const forged = await rawRequest(port, "/api/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
        body,
      });
      assert.equal(forged.status, 403);
      // A "null" origin (sandboxed iframe) is equally untrusted.
      const nulled = await rawRequest(port, "/api/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "null" },
        body,
      });
      assert.equal(nulled.status, 403);
      // The dashboard itself posts from a loopback origin — still allowed.
      const local = await rawRequest(port, "/api/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
        body,
      });
      assert.equal(local.status, 200);
      // Non-browser clients (curl, scripts) send no Origin at all — allowed.
      const noOrigin = await rawRequest(port, "/api/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      assert.equal(noOrigin.status, 200);
    } finally {
      server.close();
    }
  } finally {
    if (prev === undefined) delete process.env.LINUX_DOCTOR_CONFIG;
    else process.env.LINUX_DOCTOR_CONFIG = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("web serves read-only schedule state via /api/schedule", async () => {
  const sched = { installed: true, enabled: true, active: true, systemd: true };
  const server = await startWeb({ collect: async () => ({ findings: [] }), schedule: () => sched, open: false, port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = await (await fetch(base + "/api/schedule")).json();
    assert.deepEqual(body.schedule, sched);
  } finally {
    server.close();
  }
});

test("web /api/schedule defaults to the real timer probe with a stable shape", async () => {
  const server = await startWeb({ collect: async () => ({ findings: [] }), open: false, port: 0, quiet: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = await (await fetch(base + "/api/schedule")).json();
    for (const k of ["installed", "enabled", "active", "systemd"]) {
      assert.equal(typeof body.schedule[k], "boolean", `schedule.${k} is a boolean`);
    }
  } finally {
    server.close();
  }
});
