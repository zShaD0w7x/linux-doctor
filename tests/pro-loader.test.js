import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRO_ENTRY = join(ROOT, "pro", "index.mjs");

test("pro-loader: without Pro module, free edition has no premium checks", async () => {
  const { resetProState, loadProModule } = await import("../src/pro.js");
  const { checks } = await import("../src/checks/index.js");
  resetProState();
  delete process.env.LINUX_DOCTOR_PRO_MODULE;
  const state = await loadProModule();
  assert.equal(state.checks.length, 0, "free edition should have 0 Pro checks");
  const hasPremium = checks.some((c) => c.premium);
  assert.equal(hasPremium, false, "builtin checks should not be premium");
  resetProState();
});

test("pro-loader: with Pro module, premium check appears via init()", async () => {
  if (!existsSync(PRO_ENTRY)) {
    console.log("# skip: pro/index.mjs not present (free edition)");
    return;
  }
  const { resetProState, loadProModule } = await import("../src/pro.js");
  process.env.LINUX_DOCTOR_PRO_MODULE = PRO_ENTRY;
  resetProState();
  try {
    const state = await loadProModule();
    assert.equal(state.checks.length, 1);
    assert.equal(state.checks[0].id, "pro-demo");
    assert.equal(state.checks[0].premium, true);

    const produced = await state.checks[0].run({ run: async () => ({ ok: true, stdout: "", stderr: "" }) });
    assert.equal(produced[0].code, "pro/demo");
    assert.equal(produced[0].title, "Demo premium check ran");
  } finally {
    delete process.env.LINUX_DOCTOR_PRO_MODULE;
    resetProState();
  }
});

test("pro-loader: --check-list shows premium flag only with Pro", async () => {
  const { spawnSync } = await import("node:child_process");
  const base = spawnSync("node", ["bin/doctor.js", "--check-list"], { encoding: "utf8" });
  const baseList = JSON.parse(base.stdout);
  const baseHasPro = baseList.some((c) => c.premium);
  assert.equal(baseHasPro, false, "without Pro, no premium in --check-list");

  if (!existsSync(PRO_ENTRY)) {
    console.log("# skip: pro/index.mjs not present");
    return;
  }
  const withPro = spawnSync("node", ["bin/doctor.js", "--check-list"], {
    encoding: "utf8",
    env: { ...process.env, LINUX_DOCTOR_PRO_MODULE: PRO_ENTRY, LINUX_DOCTOR_LICENSE: "good-key" },
  });
  const withList = JSON.parse(withPro.stdout);
  const pro = withList.find((c) => c.id === "pro-demo");
  assert.ok(pro, "pro-demo should appear with Pro");
  assert.equal(pro.premium, true);
});

test("pro-loader: licensing relay works", async () => {
  if (!existsSync(PRO_ENTRY)) {
    console.log("# skip: pro/index.mjs not present");
    return;
  }
  const { resetProState, loadProModule } = await import("../src/pro.js");
  const licenseMod = await import("../src/license.js");
  process.env.LINUX_DOCTOR_PRO_MODULE = PRO_ENTRY;
  process.env.LINUX_DOCTOR_LICENSE = "good-key";
  resetProState();
  try {
    await loadProModule();
    assert.equal(licenseMod.isPro(), true);
    assert.equal(licenseMod.proInfo().tier, "pro");
    process.env.LINUX_DOCTOR_LICENSE = "bad-key";
    assert.equal(licenseMod.isPro(), false);
  } finally {
    delete process.env.LINUX_DOCTOR_PRO_MODULE;
    delete process.env.LINUX_DOCTOR_LICENSE;
    resetProState();
  }
});
