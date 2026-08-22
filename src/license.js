/**
 * License keys gate the premium tier (Pro checks, advanced AI, alerting, the
 * scheduled agent). A key is `ldpro.v1.<payload>.<hmac>` where the payload is
 * base64url JSON and the HMAC-SHA256 signature proves the key was issued by
 * whoever holds the secret.
 *
 * The secret defaults to a public constant, so on the open-source build the
 * gate is deliberately permissive: anyone can issue themselves a key. The
 * value of Pro is the hosted service, not the key — the key exists to keep the
 * default experience free and to give the maintainer a clean switch when
 * shipping a build with a private secret (set LINUX_DOCTOR_LICENSE_SECRET).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { loadConfig } from "./config.js";

const DEFAULT_SECRET = "linux-doctor-pro-key-2026";

function secret() {
  return process.env.LINUX_DOCTOR_LICENSE_SECRET || DEFAULT_SECRET;
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function sigEqual(a, b) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Issue a new key. Used by `--license-gen` (and by tests). */
export function generateKey({ sub, tier = "pro", expDays = 3650 }) {
  const payload = b64url(
    JSON.stringify({
      v: 1,
      tier,
      sub,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expDays * 86400,
    })
  );
  return `ldpro.v1.${payload}.${sign(payload)}`;
}

/** Parse and cryptographically verify a key. Returns the payload or null. */
export function parseKey(key) {
  if (typeof key !== "string") return null;
  const parts = key.trim().split(".");
  if (parts.length !== 4 || parts[0] !== "ldpro" || parts[1] !== "v1") return null;
  const [, , payload, sig] = parts;
  if (!sigEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data || data.v !== 1 || typeof data.sub !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

/** Verify a key against its signature and expiry. Never throws. */
export function verifyKey(key) {
  const data = parseKey(key);
  if (!data) return { ok: false, reason: "invalid signature or format" };
  if (data.exp && data.exp * 1000 < Date.now()) return { ok: false, reason: "license expired" };
  return { ok: true, tier: data.tier, sub: data.sub, exp: data.exp };
}

/** The configured license key: env override wins, then the config file. */
export function configuredKey() {
  const cfg = loadConfig();
  return process.env.LINUX_DOCTOR_LICENSE || cfg.licenseKey || null;
}

/** True when a valid, unexpired key is configured. */
export function isPro() {
  const key = configuredKey();
  return key ? verifyKey(key).ok : false;
}

/** Human-readable status for `--license` and --self-test. */
export function proInfo() {
  const key = configuredKey();
  if (!key) {
    return { active: false, reason: "no license key configured (set LINUX_DOCTOR_LICENSE or config.licenseKey)" };
  }
  const v = verifyKey(key);
  return {
    active: v.ok,
    tier: v.tier ?? null,
    sub: v.sub ?? null,
    expiresAt: v.exp ? new Date(v.exp * 1000).toISOString() : null,
    reason: v.ok ? null : v.reason,
  };
}