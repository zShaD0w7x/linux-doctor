/**
 * The scrubber exists in two places (Node src/support.js and the browser
 * src-gui/js/export.js, which is also baked into the committed index.html).
 * They must redact identically: this runs BOTH implementations against the
 * same fixtures, so a change to one without the other fails here instead of
 * silently leaking an address in whichever channel was forgotten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { scrub as nodeScrub } from "../src/support.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadGuiScrub() {
  const src = readFileSync(join(ROOT, "src-gui", "js", "export.js"), "utf8");
  const ctx = vm.createContext({});
  vm.runInContext(`${src}\n;globalThis.__scrub = scrub;`, ctx);
  return ctx.__scrub;
}

const FIXTURES = [
  "connected to 192.168.1.42 port 22",
  "peer fe80::1ff:fe23:4567:890a up",
  "2001:db8::1 unreachable",
  "::1 loopback",
  "aa:bb:cc:dd:ee:ff",
  "time 12:34:56 and 2026-09-10T12:34:56Z",
  "/home/alice/.config/app",
  "/var/home/bob/.bashrc",
  "/run/media/carol/USB/file",
  "/media/dave/disk",
  "/run/user/1000/pulse",
  "std::vector<int> and ports 443:8443",
  "no address here",
  "",
  null,
  undefined,
];

test("GUI scrub and Node scrub redact identically", () => {
  const guiScrub = loadGuiScrub();
  assert.equal(typeof guiScrub, "function", "export.js must define scrub()");
  for (const f of FIXTURES) {
    assert.equal(
      guiScrub(f),
      nodeScrub(f),
      `scrub drift between src/support.js and src-gui/js/export.js for: ${JSON.stringify(f)}`,
    );
  }
});
