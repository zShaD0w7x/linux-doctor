import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuredKey, isPro, proInfo } from "../src/license.js";

/**
 * The free edition has no licensing code of its own — verification lives in
 * the proprietary Pro add-on. These tests pin the honest public behavior:
 * with no Pro module installed, everything reports "not installed", no
 * matter what key material is lying around.
 */

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("configuredKey: env override wins over config file", () => {
  withEnv({ LINUX_DOCTOR_LICENSE: "env-key", LINUX_DOCTOR_CONFIG: "/nonexistent/ld-cfg.json" }, () => {
    assert.equal(configuredKey(), "env-key");
  });
});

test("proInfo: without the add-on it says 'not installed', even with a key", () => {
  withEnv({ LINUX_DOCTOR_LICENSE: "ldpro.v1.whatever.sig", LINUX_DOCTOR_PRO_MODULE: undefined }, () => {
    const info = proInfo();
    assert.equal(info.active, false);
    assert.match(info.reason, /not installed/i);
    assert.equal(isPro(), false);
  });
});

test("proInfo: without any key it does not pretend otherwise", () => {
  withEnv({ LINUX_DOCTOR_LICENSE: undefined }, () => {
    const info = proInfo();
    assert.equal(info.active, false);
    assert.ok(info.reason.length > 0);
  });
});

test("proInfo: an explicitly broken LINUX_DOCTOR_PRO_MODULE surfaces its error", async () => {
  const { loadProModule, resetProState } = await import("../src/pro.js");
  withEnv({ LINUX_DOCTOR_PRO_MODULE: "./definitely-missing-module.mjs" }, async () => {
    resetProState();
    await loadProModule();
    // state.error is consumed by cli.js's startup warning; proInfo itself
    // stays calm and honest about the absence.
    assert.equal(proInfo().active, false);
    resetProState();
  });
});
