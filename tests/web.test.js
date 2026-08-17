import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startWeb } from "../src/web.js";

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
