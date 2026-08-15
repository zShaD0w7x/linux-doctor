import { test } from "node:test";
import assert from "node:assert/strict";
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

  const server = await startWeb({ collect, open: false, port: 0 });
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
