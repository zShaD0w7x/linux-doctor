/**
 * JSON Schema (draft-07) for `linux-doctor --json` output, schemaVersion 1.
 * `linux-doctor --schema` prints this document, so fleet servers, monitoring
 * integrations, and CI pipelines can validate reports before consuming them.
 * When the report shape changes incompatibly, schemaVersion is bumped and
 * this document is updated to match.
 */
export const reportSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "linux-doctor report",
  description: "Output of `linux-doctor --json` (schemaVersion 1).",
  type: "object",
  required: ["schemaVersion", "tool", "version", "generatedAt", "findings"],
  properties: {
    schemaVersion: { const: 1 },
    tool: { const: "linux-doctor" },
    version: { type: "string", description: "linux-doctor package version" },
    generatedAt: { type: "string", format: "date-time" },
    durationMs: { type: "number", minimum: 0 },
    newCount: { type: "integer", minimum: 0 },
    fixedCount: { type: "integer", minimum: 0 },
    ignoredCount: { type: "integer", minimum: 0, description: "findings hidden by ignore patterns this run" },
    checksRun: { type: "integer", minimum: 0, description: "how many checks actually ran" },
    checksSkipped: { type: "integer", minimum: 0, description: "checks skipped by appliesTo gating (full runs only)" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    checkErrors: {
      type: "array",
      description: "checks that threw while running; the run continued without them",
      items: {
        type: "object",
        required: ["check", "error"],
        properties: {
          check: { type: "string" },
          error: { type: "string" },
        },
      },
    },
    counts: {
      type: "object",
      properties: {
        high: { type: "integer", minimum: 0 },
        medium: { type: "integer", minimum: 0 },
        info: { type: "integer", minimum: 0 },
      },
    },
    diffSinceLast: {
      type: "object",
      properties: {
        added: { type: "array", items: { $ref: "#/definitions/briefFinding" } },
        fixed: { type: "array", items: { $ref: "#/definitions/briefFinding" } },
      },
    },
    system: {
      type: "object",
      properties: {
        distro: { type: "string" },
        family: { type: "string" },
        kind: { enum: ["desktop", "laptop", "server"] },
        kernel: { type: "string" },
        cores: { type: ["string", "number"] },
        uptime: { type: "string" },
        immutable: { type: "boolean" },
        imageBased: { type: "boolean" },
      },
    },
    findings: { type: "array", items: { $ref: "#/definitions/finding" } },
  },
  definitions: {
    finding: {
      type: "object",
      required: ["id", "check", "code", "severity", "title"],
      properties: {
        id: { type: "integer", minimum: 1 },
        check: { type: "string", description: "which check produced this finding" },
        code: { type: "string", description: "stable machine key for scripting and ignore rules" },
        dedupeKey: { type: "string", description: "root cause shared with another check's finding" },
        severity: { enum: ["high", "medium", "info"] },
        title: { type: "string" },
        detail: { type: ["string", "null"] },
        evidence: { type: ["string", "null"] },
        fix: { type: ["string", "null"] },
        confidence: { enum: ["high", "medium", "low"] },
        isNew: { type: "boolean" },
      },
    },
    briefFinding: {
      type: "object",
      required: ["severity", "title"],
      properties: {
        severity: { enum: ["high", "medium", "info"] },
        title: { type: "string" },
        code: { type: "string", description: "stable identity used for new/fixed change detection" },
      },
    },
  },
};
