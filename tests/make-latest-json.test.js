/**
 * The updater manifest is assembled by scripts/make-latest-json.mjs (the Tauri
 * CLI does not write it). Pinned here with synthetic signed artifacts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "make-latest-json.mjs");

test("make-latest-json: builds the manifest from a signed AppImage", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-upd-"));
  try {
    writeFileSync(join(dir, "Linux Doctor_0.6.0_amd64.AppImage"), "appimage");
    writeFileSync(join(dir, "Linux Doctor_0.6.0_amd64.AppImage.sig"), "SIGCONTENT\n");
    execFileSync("node", [SCRIPT, dir, "0.6.0", "v0.6.0", "zShaD0w7x/linux-doctor"], { stdio: "pipe" });
    const m = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8"));
    assert.equal(m.version, "0.6.0");
    assert.equal(m.platforms["linux-x86_64"].signature, "SIGCONTENT");
    assert.match(m.platforms["linux-x86_64"].url, /\/v0\.6\.0\/Linux\.Doctor_0\.6\.0_amd64\.AppImage$/);
    assert.match(m.pub_date, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("make-latest-json: fails clearly when no signed artifact exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-upd-"));
  try {
    writeFileSync(join(dir, "Linux.Doctor_0.6.0_amd64.AppImage"), "appimage"); // no .sig
    assert.throws(() => execFileSync("node", [SCRIPT, dir, "0.6.0", "v0.6.0", "o/r"], { stdio: "pipe" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
