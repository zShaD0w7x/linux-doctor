#!/usr/bin/env node
/**
 * Build the Tauri updater manifest (`latest.json`) from signed bundles.
 *
 * Tauri's CLI produces `<artifact>` + `<artifact>.sig` when
 * `bundle.createUpdaterArtifacts` is on and TAURI_SIGNING_PRIVATE_KEY is set;
 * it does NOT write latest.json (that is tauri-action's job). This repo uses a
 * plain `npx tauri build`, so we assemble the manifest ourselves for the
 * endpoint configured in src-tauri/tauri.conf.json.
 *
 * On Linux the updatable artifact is the AppImage; deb/rpm users update through
 * their package manager, so only the AppImage is listed.
 *
 * Usage:
 *   node scripts/make-latest-json.mjs <bundle-dir> <version> <tag> <owner/repo> [out]
 * e.g.
 *   node scripts/make-latest-json.mjs src-tauri/target/release/bundle 0.6.0 v0.6.0 zShaD0w7x/linux-doctor
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [dir, version, tag, repo, outArg] = process.argv.slice(2);
if (!dir || !version || !tag || !repo) {
  console.error("usage: make-latest-json.mjs <bundle-dir> <version> <tag> <owner/repo> [out]");
  process.exit(2);
}

/** The release workflow normalizes spaces in asset names. */
const assetName = (f) => f.replaceAll(" ", ".");

function findArtifact() {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir);
  // Prefer the updater's tar.gz when present (Tauri may emit it), else the
  // AppImage itself; both are signed as `<name>.sig`.
  const candidates = files.filter((f) => /\.AppImage(\.tar\.gz)?$/.test(f));
  for (const f of candidates) {
    const sig = `${f}.sig`;
    if (files.includes(sig)) {
      return { file: f, sigFile: join(dir, sig) };
    }
  }
  return null;
}

const found = findArtifact();
if (!found) {
  console.error(`no signed AppImage found in ${dir} — is TAURI_SIGNING_PRIVATE_KEY set?`);
  process.exit(1);
}

const signature = readFileSync(found.sigFile, "utf8").trim();
const name = assetName(found.file);
const manifest = {
  version,
  notes: process.env.RELEASE_NOTES || "",
  pub_date: new Date().toISOString(),
  platforms: {
    "linux-x86_64": {
      signature,
      url: `https://github.com/${repo}/releases/download/${tag}/${name}`,
    },
  },
};

const out = outArg || join(dir, "latest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${out} → ${name} (${version})`);
