// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Doctrine guards.
 *
 * docs/doctrine.md makes promises to users ("it never changes your system", "it
 * does not phone home"). A promise in a document rots silently, so the
 * mechanical ones are pinned here: if a check gains a filesystem handle, a
 * process spawner or an egress path, this suite fails.
 *
 * The rule is stated as an import rule rather than a text scan on purpose. The
 * first version of this test looked for write API names and matched the string
 * "rm -rf ~/.cache/thumbnails/*" in a `fix:` suggestion and the word "truncated"
 * in a comment — advice text is not a side effect. A check may only see the
 * world through `ctx.run`, and that is decidable from its imports.
 *
 * Deliberately narrow otherwise: only claims a source scan can decide live
 * here. The rest of the doctrine is enforced elsewhere and docs/doctrine.md
 * points at it — codes-registry.test.js (severity rubric), baseline-gate.mjs
 * (clean images), fixtures.test.js (recorded machines), output-parity.test.js.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECKS = join(ROOT, "src", "checks");

/** Every .js file under src/checks, recursively. */
function checkFiles(dir = CHECKS) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...checkFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = checkFiles();
const rel = (f) => f.slice(ROOT.length + 1);

/** Import specifiers of a source file, as written. */
function imports(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*import\s+(?:[^"']*?\bfrom\s+)?["']([^"']+)["']/gm)) out.push(m[1]);
  for (const m of src.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

const isModule = (spec, ...names) => names.some((n) => spec === n || spec === `node:${n}`);

test("doctrine: no check touches the filesystem — reads included", () => {
  // Checks read the world through ctx.run(), which is what makes them testable
  // with stubs and provably free of side effects. Importing fs here would break
  // both promises at once, so the rule is the import, not the call.
  const offenders = [];
  for (const f of files) {
    for (const spec of imports(readFileSync(f, "utf8"))) {
      if (isModule(spec, "fs", "fs/promises")) offenders.push(`${rel(f)} imports ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], `a check reached for the filesystem directly:\n  ${offenders.join("\n  ")}`);
});

test("doctrine: no check spawns a process — that is ctx.run's job", () => {
  const offenders = [];
  for (const f of files) {
    for (const spec of imports(readFileSync(f, "utf8"))) {
      if (isModule(spec, "child_process")) offenders.push(`${rel(f)} imports ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], `a check spawns processes outside ctx.run:\n  ${offenders.join("\n  ")}`);
});

test("doctrine: no check reaches an egress path or a network client", () => {
  // "It does not phone home" is enforced at one seam: checks cannot import the
  // modules that send data anywhere (fleet/alert/heartbeat/llm), and cannot open
  // a socket. Probing the user's own DNS through a normal command stays allowed
  // — that is the network check's job, and it is a probe, not telemetry.
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const spec of imports(src)) {
      if (/(?:^|\/)(?:fleet|alert|heartbeat|llm)\.js$/.test(spec)) offenders.push(`${rel(f)} imports egress module ${spec}`);
      if (isModule(spec, "http", "https", "net", "tls", "dns", "dgram")) offenders.push(`${rel(f)} imports ${spec}`);
    }
    if (/\bnew\s+WebSocket\b|\bfetch\s*\(/.test(src)) offenders.push(`${rel(f)} opens a network client`);
  }
  assert.deepEqual(offenders, [], `a check gained an egress path:\n  ${offenders.join("\n  ")}`);
});
