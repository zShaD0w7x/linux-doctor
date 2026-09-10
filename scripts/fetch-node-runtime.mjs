#!/usr/bin/env node
/**
 * Fetch the pinned Node runtime binary into src-tauri/runtime/node.
 *
 * The desktop packages (AppImage/deb/rpm) ship this so end users need
 * nothing on their PATH — src-tauri/src/lib.rs resolves
 * <resources>/runtime/node before falling back to PATH. Run before
 * every `tauri build` (release.yml does; see docs/RELEASING.md).
 *
 * Integrity: the tarball must match NODE_SHA256, hardcoded here from the
 * official SHASUMS256.txt — a compromised nodejs.org origin cannot get a
 * different binary past this check. Bumping NODE_VERSION requires updating
 * both constants; the hash is on
 * https://nodejs.org/dist/<version>/SHASUMS256.txt under the
 * linux-x64.tar.xz line.
 */
import { mkdirSync, writeFileSync, chmodSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NODE_VERSION = "v22.23.2";
const NODE_SHA256 = "d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307";
const FILE = `node-${NODE_VERSION}-linux-x64.tar.xz`;
const DEST = new URL("../src-tauri/runtime/node", import.meta.url).pathname;

// Fast path: the right runtime is already there (dev/rebuild) — no download.
if (existsSync(DEST)) {
  try {
    if (execFileSync(DEST, ["--version"]).toString().trim() === NODE_VERSION) {
      console.log(`${NODE_VERSION} already present → ${DEST}`);
      process.exit(0);
    }
  } catch {
    /* wrong/broken binary — refetch below */
  }
}

const work = mkdtempSync(join(tmpdir(), "linux-doctor-node-"));
try {
  const res = await fetch(`https://nodejs.org/dist/${NODE_VERSION}/${FILE}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    console.error(`download failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const tarball = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(tarball).digest("hex");
  if (got !== NODE_SHA256) {
    console.error(`sha256 mismatch: got ${got}, want ${NODE_SHA256}`);
    process.exit(1);
  }
  const tarPath = join(work, FILE);
  writeFileSync(tarPath, tarball, { flag: "wx" });
  execFileSync("tar", ["-xJf", tarPath, "-C", work, `${FILE.replace(/\.tar\.xz$/, "")}/bin/node`], { stdio: "inherit" });
  mkdirSync(DEST.replace(/\/node$/, ""), { recursive: true });
  rmSync(DEST, { force: true });
  execFileSync("cp", [join(work, FILE.replace(/\.tar\.xz$/, ""), "bin", "node"), DEST], { stdio: "inherit" });
  chmodSync(DEST, 0o755);
  console.log(execFileSync(DEST, ["--version"]).toString().trim(), "→", DEST);
} finally {
  rmSync(work, { recursive: true, force: true });
}
