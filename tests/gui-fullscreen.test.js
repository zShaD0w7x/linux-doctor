// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * F11 fullscreen needs three things to agree, and any one of them missing fails
 * silently: the key handler in the dashboard script, `withGlobalTauri` so the
 * page can reach the window API at all, and the capability that lets it call
 * `set_fullscreen`. This is the guard for that agreement.
 *
 * It exists because the feature was reported as "F11 does nothing" while all
 * three were absent: nothing was wired, so there was nothing to see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("fullscreen: the built dashboard binds F11", () => {
  // The built artifact, not the source: this is what ships to the webview.
  const html = read("src-gui/index.html");
  assert.match(html, /e\.key === "F11"/, "F11 must be handled in the dashboard script");
  assert.match(html, /setFullscreen\(/, "F11 must call the window API");
  assert.match(html, /getCurrentWindow/, "the window API is reached through getCurrentWindow()");
});

test("fullscreen: the app exposes the window API and permits set_fullscreen", () => {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.equal(conf.app.withGlobalTauri, true, "without withGlobalTauri the page has no window.__TAURI__");

  const caps = JSON.parse(read("src-tauri/capabilities/default.json"));
  assert.ok(
    caps.permissions.includes("core:window:allow-set-fullscreen"),
    "Tauri denies window commands by default; set_fullscreen needs its capability",
  );
  assert.ok(
    caps.permissions.includes("core:window:allow-is-fullscreen"),
    "toggling needs the current state, so is_fullscreen too",
  );
});
