import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReport, renderPlain, countBySeverity, renderJson } from "../src/report.js";

test("countBySeverity: counts per severity in canonical order", () => {
  const counts = countBySeverity([
    { severity: "info", title: "a" },
    { severity: "high", title: "b" },
    { severity: "medium", title: "c" },
  ]);
  assert.deepEqual(counts, [
    { severity: "high", count: 1 },
    { severity: "medium", count: 1 },
    { severity: "info", count: 1 },
  ]);
});

test("renderPlain: tab-separated rows, # metadata, no emoji or colors", () => {
  const findings = [
    { severity: "high", title: "3 services failed to start", detail: "They are failed.", fix: "Run `systemctl status x`" },
    { severity: "info", title: "Firewall is active", detail: null, fix: null },
  ];
  const out = renderPlain(findings, {
    system: { distro: "Bazzite 44", kernel: "6.1.0", cores: 4, uptime: "1h" },
    score: 85,
    newCount: 1,
  });

  assert.match(out, /^# linux-doctor$/m);
  assert.match(out, /^# system: Bazzite 44 · kernel 6\.1\.0 · 4 core\(s\) · up 1h$/m);
  assert.match(out, /^# score: 85\/100$/m);
  assert.match(out, /^# new: 1$/m);
  assert.match(out, /^# summary: 1 high, 0 medium, 1 info$/m);
  assert.match(out, /^high\t1\t3 services failed to start$/m);
  assert.match(out, /^detail\t1\tThey are failed\.$/m);
  assert.match(out, /^fix\t1\tRun `systemctl status x`$/m);
  assert.match(out, /^info\t2\tFirewall is active$/m);
  assert.ok(!/🩺|🔴|✅|─/.test(out), "no emoji or box drawing in plain output");
  assert.ok(!out.includes("\u001b["), "no ANSI escapes in plain output");
});

test("renderPlain: fixedCount becomes a # fixed comment line", () => {
  const out = renderPlain([], { fixedCount: 3 });
  assert.match(out, /^# fixed: 3$/m);
  assert.doesNotMatch(renderPlain([], {}), /^# fixed:/m);
});

test("renderPlain: (new) marker travels into the plain title", () => {
  const out = renderPlain([{ severity: "medium", title: "Suspend hooks are failing", isNew: true }]);
  assert.match(out, /^medium\t1\tSuspend hooks are failing \(new\)$/m);
});

test("renderReport: the NEW badge renders without literal template syntax", async () => {
  const out = await renderReport(
    [{ severity: "medium", title: "Suspend hooks are failing", isNew: true, detail: null, evidence: null, fix: null }],
    { system: { distro: "Bazzite 44", kernel: "6.1.0", cores: 4, uptime: "1h" }, score: 92, newCount: 1 }
  );
  assert.match(out, /🆕 NEW/);
  assert.ok(!out.includes("${A.bold}"), "the ANSI placeholder must not print literally");
  assert.ok(!out.includes("${A.cyan}"), "the ANSI placeholder must not print literally");
  assert.ok(!out.includes("${A.reset}"), "the ANSI placeholder must not print literally");
});

test("renderPlain: multi-line detail is flattened to a single row", () => {
  const out = renderPlain([
    { severity: "high", title: "t", detail: "line one\nline two", fix: "fix\nsecond" },
  ]);
  assert.match(out, /^detail\t1\tline one \| line two$/m);
  assert.match(out, /^fix\t1\tfix \| second$/m);
});

test("renderPlain: empty findings still print metadata", () => {
  const out = renderPlain([]);
  assert.match(out, /^# summary: 0 high, 0 medium, 0 info$/m);
  assert.ok(!/^\w+\t1\t/.test(out), "no finding rows when there are none");
});

test("renderJson: v1 schema with tool/version and caller metadata", () => {
  const out = JSON.parse(renderJson(
    [{ id: 1, check: "network", code: "network/network-and-dns-look-healthy", severity: "info", title: "x" }],
    { distro: "Bazzite 44" },
    { generatedAt: "2026-08-18T00:00:00.000Z", score: 90, durationMs: 123 }
  ));
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.tool, "linux-doctor");
  assert.equal(typeof out.version, "string");
  assert.equal(out.generatedAt, "2026-08-18T00:00:00.000Z", "caller's generatedAt wins");
  assert.equal(out.durationMs, 123);
  assert.equal(out.score, 90);
  assert.equal(out.system.distro, "Bazzite 44");
  assert.equal(out.findings[0].check, "network");
  assert.equal(out.findings[0].code, "network/network-and-dns-look-healthy");
});

test("renderJson: generatedAt defaults to now when not provided", () => {
  const out = JSON.parse(renderJson([]));
  assert.match(out.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
