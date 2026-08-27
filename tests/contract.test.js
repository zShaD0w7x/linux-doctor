import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checks } from "../src/checks/index.js";
import { detectDistro } from "../src/distro.js";
import { loadThresholds } from "../src/thresholds.js";
import { normalizeFindings, invalidFindings } from "../src/findings.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A stub ctx where every command fails (missing tools, empty output). This is
 * the fallback path every check must survive, and whatever it returns still
 * has to satisfy the finding contract — a guard against regressions in checks
 * and against future checks that bypass the finding() factory.
 */
function stubCtx() {
  return {
    osRelease: { id: "fedora", id_like: null },
    dist: detectDistro({ id: "fedora", id_like: null }),
    thresholds: loadThresholds({}),
    run: async () => ({ ok: false, code: 1, stdout: "", stderr: "" }),
  };
}

test("every free check survives an all-fail run without throwing", async () => {
  const ctx = stubCtx();
  for (const c of checks) {
    try {
      await c.run(ctx);
    } catch (e) {
      assert.fail(`${c.id} threw on the all-fail path: ${e.message}`);
    }
  }
});

test("every free check's all-fail output satisfies the finding contract", async () => {
  const ctx = stubCtx();
  for (const c of checks) {
    const findings = await c.run(ctx);
    const normalized = normalizeFindings(findings.map((f) => ({ ...f, check: c.id })));
    const malformed = invalidFindings(normalized);
    assert.deepEqual(
      malformed,
      [],
      `${c.id} returned malformed findings: ${JSON.stringify(malformed)}`
    );
  }
});

test("every finding code is explicit or dedupe-backed (stable identity)", async () => {
  const ctx = stubCtx();
  for (const c of checks) {
    const src = readFileSync(join(ROOT, "src/checks", `${c.id}.js`), "utf8");
    const findings = await c.run(ctx);
    const normalized = normalizeFindings(findings.map((f) => ({ ...f, check: c.id })));
    for (const f of normalized) {
      const explicit = new RegExp(`["'\`]${f.code}["'\`]`).test(src);
      assert.ok(
        explicit,
        `${c.id}: code "${f.code}" is not an explicit code literal in the source — the identity would drift with the title`
      );
    }
  }
});

test("explicit codes in check sources are well-formed slug paths", async () => {
  for (const c of checks) {
    const src = readFileSync(join(ROOT, "src/checks", `${c.id}.js`), "utf8");
    const blocks = [...src.matchAll(/finding\(\{[\s\S]*?\}\)/g)];
    const codes = blocks.flatMap((b) =>
      [...b[0].matchAll(/code:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1])
    );
    assert.ok(codes.length > 0, `${c.id}: no finding blocks found`);
    for (const code of codes) {
      assert.match(
        code,
        /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/,
        `${c.id}: malformed code literal "${code}"`
      );
    }
  }
});

test("no check claims health from missing data", async () => {
  // The data source failed for every command, so any ok/healthy/good finding
  // would be a lie. Checks must stay silent or emit an explicit skipped one.
  const ctx = stubCtx();
  for (const c of checks) {
    const findings = await c.run(ctx);
    for (const f of findings) {
      assert.ok(
        !/^[a-z0-9-]+\/(?:ok|healthy|good|fine)$/.test(f.code),
        `${c.id}: emitted a health-claiming finding (${f.code}) while its data source was unavailable`
      );
    }
  }
});

test("dedupeKey usage is limited to the documented roots", async () => {
  const allowed = new Set(["software-rendering", "system-sleep-hooks"]);
  for (const c of checks) {
    const src = readFileSync(join(ROOT, "src/checks", `${c.id}.js`), "utf8");
    const keys = [...src.matchAll(/dedupeKey:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
    for (const key of keys) {
      const literal = key.replace(/^["'`]|["'`]$/g, "");
      assert.ok(
        allowed.has(literal) || literal.startsWith("disk:") || literal.startsWith("inodes:") || literal.startsWith("boot:"),
        `${c.id}: dedupeKey ${key} is not a documented dedupe root`
      );
    }
  }
});