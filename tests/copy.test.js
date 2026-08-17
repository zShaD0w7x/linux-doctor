import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checks } from "../src/checks/index.js";
import { detectDistro } from "../src/distro.js";

// Run every check against an empty (healthy) system and enforce copy rules on
// the findings users actually see. Also catches two classes of bugs for free:
// a check that throws on empty input, and invalid confidence values.
const prevTtl = process.env.LINUX_DOCTOR_UPDATES_TTL_MS;
const prevCache = process.env.LINUX_DOCTOR_CACHE;
const cacheDir = mkdtempSync(join(tmpdir(), "ld-copy-cache-"));
process.env.LINUX_DOCTOR_UPDATES_TTL_MS = "0";
process.env.LINUX_DOCTOR_CACHE = cacheDir;

const stub = () => ({
  run: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
  osRelease: { id: "fedora", id_like: "fedora" },
  dist: detectDistro({ id: "fedora", id_like: "fedora" }),
  thresholds: {},
  profile: { kind: "desktop" },
});

const BANNED = [
  { re: /\byou should\b/i, why: "weak phrasing — say what to do, not what you advise" },
  { re: /\bplease\b/i, why: "no begging" },
  { re: /\bTODO\b|\bFIXME\b|\bTBD\b/, why: "unfinished copy" },
  { re: /lorem/i, why: "placeholder text" },
  { re: /\bXXX\b/, why: "placeholder text" },
  { re: /  +/, why: "double space" },
];

async function sample(check) {
  try {
    return { findings: await check.run(stub()), threw: null };
  } catch (err) {
    return { findings: [], threw: err.message };
  }
}

test("every check produces clean, consistent copy on a healthy system", async () => {
  const problems = [];
  for (const c of checks) {
    const { findings, threw } = await sample(c);
    if (threw) {
      problems.push(`${c.id}: threw on empty input: ${threw}`);
      continue;
    }
    for (const f of findings) {
      if (!f.title) {
        problems.push(`${c.id}: finding without a title`);
        continue;
      }
      if (f.title !== f.title.trim()) problems.push(`${c.id}: title has leading/trailing whitespace: "${f.title}"`);
      if (!/^[A-Z0-9("]/.test(f.title)) problems.push(`${c.id}: title should start with an uppercase letter or digit: "${f.title}"`);
      if (/[.!?]$/.test(f.title)) problems.push(`${c.id}: title should not end with punctuation: "${f.title}"`);
      if (f.title.includes("—")) problems.push(`${c.id}: title uses an em-dash: "${f.title}"`);
      if (f.title.length > 80) problems.push(`${c.id}: title too long (${f.title.length} chars): "${f.title}"`);
      if (!["high", "medium", "info"].includes(f.severity)) problems.push(`${c.id}: invalid severity ${f.severity} on "${f.title}"`);
      if (!["high", "medium", "low"].includes(f.confidence)) problems.push(`${c.id}: invalid confidence ${f.confidence} on "${f.title}"`);
      for (const field of ["detail", "fix"]) {
        const text = f[field];
        if (typeof text !== "string") continue;
        if (text !== text.trim()) problems.push(`${c.id}: ${field} has leading/trailing whitespace on "${f.title}"`);
        for (const { re, why } of BANNED) {
          if (re.test(text)) problems.push(`${c.id}: ${field} on "${f.title}" ${why} (${re})`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("check metadata (title) is prose-safe", () => {
  const problems = [];
  for (const c of checks) {
    if (!c.title || c.title !== c.title.trim()) problems.push(`${c.id}: check title missing or untrimmed`);
    if (!/^[A-Z0-9(]/.test(c.title || "")) problems.push(`${c.id}: check title should start uppercase: "${c.title}"`);
  }
  assert.deepEqual(problems, []);
});

// Restore env after all tests in this file.
test.after(() => {
  if (prevTtl === undefined) delete process.env.LINUX_DOCTOR_UPDATES_TTL_MS;
  else process.env.LINUX_DOCTOR_UPDATES_TTL_MS = prevTtl;
  if (prevCache === undefined) delete process.env.LINUX_DOCTOR_CACHE;
  else process.env.LINUX_DOCTOR_CACHE = prevCache;
  rmSync(cacheDir, { recursive: true, force: true });
});
