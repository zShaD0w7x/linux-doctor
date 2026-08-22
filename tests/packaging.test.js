import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("npm package ships every file the runtime reads", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const files = pkg.files;
  // src/web.js reads ../src-gui/index.html at import time. If that file is
  // not in "files", the published npm package crashes on EVERY invocation
  // (cli.js imports web.js unconditionally), not just with --web.
  assert.ok(files.includes("src-gui/index.html"), "src-gui/index.html must be shipped in the npm package");
  assert.ok(files.includes("bin"), "bin must be shipped");
  assert.ok(files.includes("src"), "src must be shipped");
  assert.ok(files.includes("README.md"), "README.md must be shipped");
  assert.ok(files.includes("LICENSE"), "LICENSE must be shipped");
  // The README links the dual-license docs; a published tarball without them
  // ships a README with broken links (and hides the commercial-license option).
  assert.ok(files.includes("COMMERCIAL-LICENSE.md"), "COMMERCIAL-LICENSE.md must be shipped");
  assert.ok(files.includes("CONTRIBUTING.md"), "CONTRIBUTING.md must be shipped");
});

test("web.js' dashboard page exists on disk", () => {
  const page = join(root, "src-gui", "index.html");
  assert.doesNotThrow(() => readFileSync(page, "utf8"), "src-gui/index.html must exist");
});
