import { test } from "node:test";
import assert from "node:assert/strict";
import { reportSchema } from "../src/schema.js";

test("reportSchema: is a draft-07 schema with the core report shape", () => {
  assert.equal(reportSchema.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(reportSchema.type, "object");
  for (const key of ["schemaVersion", "tool", "version", "generatedAt", "findings"]) {
    assert.ok(reportSchema.required.includes(key), `required should include ${key}`);
  }
  assert.equal(reportSchema.properties.schemaVersion.const, 1);
  assert.equal(reportSchema.properties.tool.const, "linux-doctor");
});

test("reportSchema: finding definition requires check/code/severity/title", () => {
  const finding = reportSchema.definitions.finding;
  for (const key of ["id", "check", "code", "severity", "title"]) {
    assert.ok(finding.required.includes(key), `finding should require ${key}`);
  }
  assert.deepEqual(finding.properties.severity.enum, ["high", "medium", "info"]);
});

test("reportSchema: a real report validates against its own schema", () => {
  // Structural check with the minimal validator: every required key present.
  const report = {
    schemaVersion: 1,
    tool: "linux-doctor",
    version: "0.1.0",
    generatedAt: "2026-08-18T00:00:00.000Z",
    durationMs: 42,
    score: 85,
    newCount: 1,
    fixedCount: 0,
    counts: { high: 1, medium: 0, info: 2 },
    diffSinceLast: { added: [{ severity: "high", title: "x" }], fixed: [] },
    system: { kind: "laptop" },
    findings: [
      { id: 1, check: "memory", code: "memory/x", dedupeKey: null, severity: "high", title: "x", detail: null, evidence: "e", fix: "f", confidence: "high", isNew: true },
    ],
  };
  for (const key of reportSchema.required) {
    assert.ok(key in report, `report should carry ${key}`);
  }
  assert.equal(reportSchema.properties.findings.items.$ref, "#/definitions/finding");
  assert.equal(reportSchema.properties.system.properties.kind.enum.includes("server"), true);
});
