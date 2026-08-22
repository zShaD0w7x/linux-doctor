import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKey, parseKey, verifyKey, isPro, proInfo } from "../src/license.js";

test("generateKey + verifyKey: roundtrip carries sub and tier", () => {
  const key = generateKey({ sub: "me@example.com" });
  assert.match(key, /^ldpro\.v1\./);
  const v = verifyKey(key);
  assert.equal(v.ok, true);
  assert.equal(v.sub, "me@example.com");
  assert.equal(v.tier, "pro");
  assert.equal(typeof v.exp, "number");
});

test("verifyKey: rejects a tampered signature", () => {
  const key = generateKey({ sub: "me@example.com" });
  const tampered = key.slice(0, -2) + (key.endsWith("aa") ? "bb" : "aa");
  assert.equal(verifyKey(tampered).ok, false);
});

test("verifyKey: rejects garbage input", () => {
  assert.equal(verifyKey("not-a-key").ok, false);
  assert.equal(verifyKey(null).ok, false);
  assert.equal(verifyKey("ldpro.v1.abc.def").ok, false);
});

test("verifyKey: rejects an expired key", () => {
  const key = generateKey({ sub: "x", expDays: -1 });
  const v = verifyKey(key);
  assert.equal(v.ok, false);
  assert.match(v.reason, /expired/);
});

test("parseKey: returns the decoded payload for a valid key", () => {
  const key = generateKey({ sub: "alice", tier: "pro" });
  const data = parseKey(key);
  assert.equal(data.sub, "alice");
  assert.equal(data.tier, "pro");
});

test("isPro/proInfo: a valid LINUX_DOCTOR_LICENSE activates Pro", () => {
  process.env.LINUX_DOCTOR_LICENSE = generateKey({ sub: "tester" });
  try {
    assert.equal(isPro(), true);
    const info = proInfo();
    assert.equal(info.active, true);
    assert.equal(info.sub, "tester");
    assert.ok(info.expiresAt);
  } finally {
    delete process.env.LINUX_DOCTOR_LICENSE;
  }
});

test("isPro/proInfo: an invalid key is not Pro and explains why", () => {
  process.env.LINUX_DOCTOR_LICENSE = "garbage";
  try {
    assert.equal(isPro(), false);
    const info = proInfo();
    assert.equal(info.active, false);
    assert.ok(info.reason);
  } finally {
    delete process.env.LINUX_DOCTOR_LICENSE;
  }
});

test("isPro: a key in the config file activates Pro", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-license-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ licenseKey: generateKey({ sub: "cfg" }) }));
  const prev = process.env.LINUX_DOCTOR_CONFIG;
  process.env.LINUX_DOCTOR_CONFIG = file;
  try {
    assert.equal(isPro(), true);
    assert.equal(proInfo().sub, "cfg");
  } finally {
    if (prev === undefined) delete process.env.LINUX_DOCTOR_CONFIG;
    else process.env.LINUX_DOCTOR_CONFIG = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isPro: no key anywhere means not Pro", () => {
  delete process.env.LINUX_DOCTOR_LICENSE;
  const dir = mkdtempSync(join(tmpdir(), "ld-license-"));
  const file = join(dir, "config.json");
  writeFileSync(file, "{}");
  const prev = process.env.LINUX_DOCTOR_CONFIG;
  process.env.LINUX_DOCTOR_CONFIG = file;
  try {
    assert.equal(isPro(), false);
    assert.equal(proInfo().active, false);
  } finally {
    if (prev === undefined) delete process.env.LINUX_DOCTOR_CONFIG;
    else process.env.LINUX_DOCTOR_CONFIG = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});