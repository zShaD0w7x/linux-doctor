/**
 * Open-core guardrails.
 *
 * 1. This repository is the FREE edition: no licensing crypto, no key
 *    generation, no premium checks may ever land here. The guard test fails
 *    the suite if any of that code reappears — public trust depends on it.
 * 2. The loader contract for the proprietary Pro add-on is pinned with a
 *    fixture module, so the private package knows exactly what it must
 *    implement (init(core) → { checks, licensing }).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

function listFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

test("guard: no licensing crypto or key generation in src/", () => {
  const forbidden = [/ldpro/, /createHmac/i, /DEFAULT_SECRET/, /license-gen/, /generateKey/, /verifyKey\(/, /parseKey\(/];
  const offenders = [];
  for (const f of listFiles(SRC)) {
    const text = readFileSync(f, "utf8");
    for (const re of forbidden) {
      if (re.test(text)) offenders.push(`${f.replace(SRC, "src")}: matches ${re}`);
    }
  }
  assert.deepEqual(offenders, [], `proprietary licensing code leaked into the free edition:\n${offenders.join("\n")}`);
});

test("guard: no bundled premium checks directory", () => {
  assert.ok(!existsSync(join(SRC, "checks", "pro")), "src/checks/pro must not exist in the free edition");
});

test("loader contract: init(core) → { checks, licensing } registers premium checks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-pro-module-"));
  const entry = join(dir, "fake-pro.mjs");
  writeFileSync(entry, `
    export function init({ defineCheck, finding }) {
      return {
        checks: [
          defineCheck({
            id: "fixture-pro",
            title: "Fixture premium check",
            category: "pro",
            premium: true,
            appliesTo: ["desktop", "laptop", "server"],
            async run() {
              return [finding({
                severity: "info",
                code: "fixture/ok",
                title: "Fixture ran",
                detail: null,
                evidence: null,
                fix: null,
              })];
            },
          }),
        ],
        licensing: {
          isActive: (key) => key === "good-key",
          info: (key) => key === "good-key"
            ? { active: true, tier: "pro", sub: "buyer@example.com", expiresAt: null }
            : { active: false, tier: null, sub: null, expiresAt: null, reason: "invalid signature or format" },
        },
      };
    }
  `);

  const { loadProModule, resetProState } = await import("../src/pro.js");
  const licenseMod = await import("../src/license.js");

  process.env.LINUX_DOCTOR_PRO_MODULE = entry;
  process.env.LINUX_DOCTOR_LICENSE = "good-key";
  resetProState();
  try {
    const state = await loadProModule();
    assert.equal(state.checks.length, 1);
    assert.equal(state.checks[0].id, "fixture-pro");
    assert.equal(state.checks[0].premium, true);
    // The finding factory was injected and works inside the module:
    const produced = await state.checks[0].run({ run: async () => ({ ok: true, stdout: "", stderr: "" }) });
    assert.equal(produced[0].code, "fixture/ok");
    // Licensing relay: core asks, module answers.
    assert.equal(licenseMod.isPro(), true);
    assert.equal(licenseMod.proInfo().tier, "pro");
    assert.match(licenseMod.proInfo().sub, /buyer@/);

    // A wrong key is the module's verdict, not the core's guess.
    process.env.LINUX_DOCTOR_LICENSE = "bad-key";
    assert.equal(licenseMod.isPro(), false);
    assert.match(licenseMod.proInfo().reason, /invalid signature/);
  } finally {
    delete process.env.LINUX_DOCTOR_PRO_MODULE;
    delete process.env.LINUX_DOCTOR_LICENSE;
    resetProState();
    rmSync(dir, { recursive: true, force: true });
  }
});
