// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Guard for scripts/bump-version.mjs.
 *
 * The release script lists every manifest path as a string literal and dies at
 * the first one that has moved. That is not hypothetical: the AUR files were
 * reorganised into packaging/aur/ and the script kept pointing at
 * packaging/PKGBUILD, so a release stopped halfway through and left the RPM
 * spec and the docs regeneration un-run, silently.
 *
 * This reads the paths out of the script and checks they exist, which is the
 * failure it would have caught.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(ROOT, "scripts", "bump-version.mjs"), "utf8");

const paths = [...source.matchAll(/bump(?:Json|Text)\(\s*"([^"]+)"/g)].map((m) => m[1]);

test("bump-version: every manifest it rewrites exists", () => {
  assert.ok(paths.length >= 6, "expected the script to list its manifests");
  const missing = paths.filter((p) => !existsSync(join(ROOT, p)));
  assert.deepEqual(
    missing,
    [],
    `scripts/bump-version.mjs points at paths that no longer exist:\n  ${missing.join("\n  ")}`,
  );
});

test("bump-version: the AUR pair is bumped together", () => {
  // PKGBUILD and .SRCINFO must carry the same pkgver, or makepkg and the AUR
  // both reject the pair. A script that rewrites one without the other is the
  // bug this file exists for.
  const pkgbuild = paths.filter((p) => p.endsWith("PKGBUILD"));
  const srcinfo = paths.filter((p) => p.endsWith(".SRCINFO"));
  assert.equal(pkgbuild.length, 1, "PKGBUILD must be bumped");
  assert.equal(srcinfo.length, 1, ".SRCINFO must be bumped alongside it");
});
