#!/usr/bin/env node
/**
 * Fetch the pinned Node runtime binary into src-tauri/runtime/node.
 *
 * The desktop packages (AppImage/deb/rpm) ship this so end users need
 * nothing on their PATH — src-tauri/src/lib.rs resolves
 * <resources>/runtime/node before falling back to PATH. Run before
 * every `tauri build` (release.yml does; see docs/RELEASING.md).
 *
 * Integrity: the tarball must match its line in the official
 * SHASUMS256.txt fetched from nodejs.org (guards against truncated or
 * corrupted downloads).
 */
import { mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const NODE_VERSION = "v22.14.0";
const FILE = `node-${NODE_VERSION}-linux-x64.tar.xz`;
const URL_BASE = `https://nodejs.org/dist/${NODE_VERSION}`;
const DEST = new URL("../src-tauri/runtime/node", import.meta.url).pathname;

const tarball = Buffer.from(await (await fetch(`${URL_BASE}/${FILE}`)).arrayBuffer());
const sums = await (await fetch(`${URL_BASE}/SHASUMS256.txt`)).text();
const expected = sums.split("\n").find((l) => l.endsWith(` ${FILE}`));
if (!expected) {
  console.error(`${FILE}: no line in SHASUMS256.txt`);
  process.exit(1);
}
const got = createHash("sha256").update(tarball).digest("hex");
const want = expected.trim().split(/\s+/)[0];
if (got !== want) {
  console.error(`sha256 mismatch: got ${got}, want ${want}`);
  process.exit(1);
}
writeFileSync(`/tmp/${FILE}`, tarball);
rmSync("/tmp/node-runtime-extract", { recursive: true, force: true });
mkdirSync("/tmp/node-runtime-extract", { recursive: true });
execFileSync("tar", ["-xJf", `/tmp/${FILE}`, "-C", "/tmp/node-runtime-extract", `${FILE.replace(/\.tar\.xz$/, "")}/bin/node`], { stdio: "inherit" });
mkdirSync(DEST.replace(/\/node$/, ""), { recursive: true });
execFileSync("cp", ["/tmp/node-runtime-extract/" + FILE.replace(/\.tar\.xz$/, "") + "/bin/node", DEST], { stdio: "inherit" });
chmodSync(DEST, 0o755);
console.log(execFileSync(DEST, ["--version"]).toString().trim(), "→", DEST);
