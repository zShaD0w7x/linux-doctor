# Release Checklist Research — What Mature Open-Source Releases Contain

**Date:** 2026-08-27 · **Scope:** primary sources only (official docs, source code, specs, first-party APIs)  
**Projects inspected:** ripgrep, bat, helix, Tauri (core + updater plugin), npm ecosystem, GitHub Releases platform, SLSA/OpenSSF

---

## 1. Conventional checklist across mature projects

All three Rust/CLI flagships publish an explicit `RELEASE-CHECKLIST.md` and follow the same skeleton:

1. **Sync version strings** in every manifest, run the lockfile updater, commit.
2. **Curate `CHANGELOG.md`** (human-written, not raw git log) — add dated section, copy relevant entries to GitHub Release notes.
3. **Regenerate derived artifacts** (completions, man page, syntax/theme assets, docs) before tagging.
4. **Push branch, wait for CI green**, then create **signed tag** (`git tag -s`) and push it separately so the release workflow triggers.
5. **Dry-run publish checks** (`cargo package` / `cargo publish --dry-run` / `npm pack --dry-run`) before the tag.
6. **GitHub Release** auto-created from the tag; artifacts attached; SHA-256 hashes updated downstream (Homebrew, AUR).
7. **Publish to registry** (`cargo publish` from a clean clone, `npm publish` with provenance) after the GitHub Release succeeds.
8. **Open next Unreleased section** in `CHANGELOG.md`.

Sources:

- ripgrep: edit `Cargo.toml`, `cargo update -p ripgrep` to update `Cargo.lock`, commit + **signed tag**, `cargo package` check, push branch first then tag, CI creates release, copy `CHANGELOG` section to release notes, `cargo publish`, `sha256-releases` for Homebrew, add `TBD/Unreleased` header — [github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md)
- bat: `Cargo.toml` + `cargo build` for `Cargo.lock`, update version + MSRV in `README.md`/`doc/README-*.md`, draft changelog by comparing auto-generated release notes vs `CHANGELOG.md`, `assets/create.sh`, review `-h/--help/man` (CI `Documentation` job renders man), **push + wait CI**, `cargo publish --dry-run`, `git tag vX.Y.Z && git push`, create GitHub Release copying `CHANGELOG` section, verify archives/debs appear, `cargo publish` in clean clone, add `# unreleased` stub — [github.com/sharkdp/bat/blob/master/doc/release-checklist.md](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md) ; CI gates + release artifact upload — [github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml)
- helix: `workspace.package.version` in root `Cargo.toml` (CalVer→SemVer mapping `YY.0M→YY.M.0`), `cargo check` for `Cargo.lock`, `CHANGELOG.md` + `contrib/Helix.appdata.xml` (AppStream `<release>` entry), merge release PR, **`git tag -s -m "<tag>" -a <tag> && git push`** (note `-s`), Release CI auto-turns tag into GitHub Release, edit release title/link changelog, `sha256sum` on `.tar.xz` for Homebrew formula — [helix-editor.vercel.app/contributing/releases/](https://helix-editor.vercel.app/contributing/releases/)

---

## 2. Version-sync patterns

| File / pattern | Canonical rule |
|---|---|
| `package.json` + `package-lock.json` | `npm version` bumps **both** atomically and (by default) creates a commit+tag; `npm@9.5+` required for provenance [docs.npmjs.com/cli/v10/commands/npm-version](https://docs.npmjs.com/cli/v10/commands/npm-version) ; `version` + `package-lock` must stay in sync or `npm ci`/`npm publish` fails |
| `Cargo.toml` + `Cargo.lock` | Edit `version`, then `cargo update -p <crate>` (ripgrep) or `cargo build`/`cargo check` (bat/helix) and `git add Cargo.lock`; Cargo only accepts SemVer so CalVer projects map `22.07→22.7.0` [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) · [helix releases](https://helix-editor.vercel.app/contributing/releases/) · [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md) |
| `tauri.conf.json` `version` | `string \| null \| path/to/package.json`; if omitted falls back to `Cargo.toml` version; recommended to manage version in Tauri config [v2.tauri.app/reference/config/](https://v2.tauri.app/reference/config/) ; issue tracking sync gap notes no automatic 3-way sync exists [github.com/tauri-apps/tauri/issues/8265](https://github.com/tauri-apps/tauri/issues/8265) ; many Tauri apps use a release script that bumps **all three** (`package.json`, `tauri.conf.json`, `Cargo.toml`) + regenerates `Cargo.lock` |
| Man page / packaging files | bat checks `man` renders in CI and lists it as asset [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml) ; `debian/changelog`, `PKGBUILD` `pkgver`, `*.spec` `Version` must match tag — ripgrep updates `pkg/brew/ripgrep-bin.rb` via `ci/sha256-releases` after release [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) |
| Cargo workspace | Helix updates `workspace.package.version` key, not each crate individually [helix releases](https://helix-editor.vercel.app/contributing/releases/) |

---

## 3. Generated artifacts (what mature releases produce)

- **CHANGELOG.md section with date** — Keep a Changelog format: `## [x.y.z] - YYYY-MM-DD` with `Added/Changed/Deprecated/Removed/Fixed/Security` groups; `Unreleased` section tracks upcoming changes [keepachangelog.com/en/1.1.0/](https://keepachangelog.com/en/1.1.0/) ; SemVer declares public API and bump rules [semver.org](https://semver.org/)
- **Docs / configuration docs** — bat regenerates binary assets via `assets/create.sh` [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md) ; linux-doctor analog: `docs/checks.md` via `scripts/generate-check-docs.mjs`
- **Shell completions** (`bash`/`zsh`/`fish`/`PowerShell`) built from `--help` spec and packaged into tarball + deb/rpm [bat CICD.yml — autocomplete copy](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml)
- **Man page** rendered/compressed (`bat.1`, `gzip -n --best`) and included in artifact + deb [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml)
- **License / copyright files** included in every artifact (`LICENSE-MIT`, `copyright` Debian format) [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml)
- **Checksums file** (`SHA256SUMS` / `sha256-releases` output) committed for Homebrew/AUR verification — ripgrep: `ci/sha256-releases {VERSION} >> pkg/brew/ripgrep-bin.rb` [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) ; helix: `sha256sum` on `.tar.xz` for Homebrew [helix releases](https://helix-editor.vercel.app/contributing/releases/)
- **SBOM** (SPDX or CycloneDX JSON) — optional but increasingly attached via `actions/attest` `sbom-path` input [github.com/actions/attest](https://github.com/actions/attest) ; GitHub docs: `sbom-path` creates SBOM attestation [docs.github.com — artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- **Signatures / provenance attestations** — see §7

---

## 4. GitHub Release practices

- **Releases are tags** — tag date may differ from release date; GitHub auto-adds `.zip`/`.tar.gz` source archives; up to 1000 assets per release, each < 2 GiB [docs.github.com/en/repositories/releasing-projects-on-github/about-releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- **Signed tags** — ripgrep: "create a new **signed** tag" [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) ; helix: `git tag -s -m "<tag>" -a <tag>` [helix releases](https://helix-editor.vercel.app/contributing/releases/) ; `npm version` supports `sign-git-tag` → `git tag -s` [docs.npmjs.com/cli/v10/commands/npm-version](https://docs.npmjs.com/cli/v10/commands/npm-version)
- **Release notes** — either auto-generated from PR labels via `.github/release.yml` categories [docs.github.com — automatically generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes) **or** curated `CHANGELOG.md` section copied verbatim (bat: "copy the corresponding section from `CHANGELOG.md`" [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md) ; ripgrep: "Copy the relevant section of the CHANGELOG to the tagged release notes" [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md))
- **Extracting `CHANGELOG` for tag** — mature pattern: `awk -v tag="## \\[$TAG\\]" '$0 ~ tag {p=1; next} /^## \\[/ {p=0} p' CHANGELOG.md > /tmp/notes.md` then `body_path:` with `softprops/action-gh-release` (`generate_release_notes: false`) — exactly what linux-doctor's `release.yml` does since 0.3.4
- **Artifact attachment** — `softprops/action-gh-release` with `files:` glob (tarballs, debs, AppImages) guarded by `if: startsWith(github.ref, 'refs/tags/v')` / tag ref check [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml) ; GitHub verifies release asset creation date per file [about-releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- **Two-phase push** — push branch **without** tag, wait for CI green, then push tag — ripgrep warns "Trying to do this in one step seems to result in GitHub Actions not seeing the tag push" [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md)
- **Immutable releases** (optional) — creating a draft first allows attaching all assets before the release becomes immutable [docs.github.com — attestations / immutable releases](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

---

## 5. Ecosystem-specific steps

### npm

- `npm publish --provenance` (or `publishConfig.provenance:true` / `NPM_CONFIG_PROVENANCE=true` / `.npmrc provenance=true`) on **GitHub-hosted runner** with `permissions: id-token: write`, `registry-url: https://registry.npmjs.org`, no cache, `npm@9.5+` and public `repository` field generates Sigstore-signed provenance logged to a transparency ledger [docs.npmjs.com/generating-provenance-statements](https://docs.npmjs.com/generating-provenance-statements)
- `npm publish` forbids reusing a name@version, submits `sha1` + `sha512` integrity, respects `files` / `.npmignore` / `.gitignore` inclusive rules, and never includes symlinks [docs.npmjs.com/cli/v10/commands/npm-publish](https://docs.npmjs.com/cli/v10/commands/npm-publish)
- **Trusted Publishing (OIDC) GA 2025-07-31** — replaces `NPM_TOKEN` with short-lived OIDC; automatic provenance, no `--provenance` flag needed; requires `npm@11.5.1+`, `id-token: write`, GitHub Actions or GitLab CI trusted publisher configured on npmjs.com [github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)
- Verification: `npm audit signatures` shows verified registry signatures + attestations [generating-provenance-statements](https://docs.npmjs.com/generating-provenance-statements)

### Cargo / crates.io

- `cargo package` / `cargo publish --dry-run` verifies the `.crate` compiles in a temp dir; `cargo publish` uploads and is **permanent** (yank ≠ delete) [doc.rust-lang.org/cargo/reference/publishing.html](https://doc.rust-lang.org/cargo/reference/publishing.html)
- Recommended release bundle: changelog entry + git tag pointing to published commit; tools like `cargo-release`, `release-plz` automate it [publishing.html](https://doc.rust-lang.org/cargo/reference/publishing.html)
- Publish from a **clean clone** (bat: "in a clean repository. The safest way … clone a fresh copy" [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md))

### Tauri

- `tauri.conf.json` `version` sync problem is well-known; community scripts bump `package.json` + `tauri.conf.json` + `Cargo.toml` together then regenerate `Cargo.lock` [dev.to — Ship Your Tauri v2 App](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7) (summarizing primary issue [tauri#8265](https://github.com/tauri-apps/tauri/issues/8265))
- **Updater** requires keypair (`tauri signer generate`), `pubkey` in `tauri.conf.json`, `createUpdaterArtifacts: true`, `endpoints` with `{{current_version}}/{{target}}/{{arch}}` templates; build emits `*.AppImage.tar.gz` + `.sig` (Linux), `app.tar.gz`+`.sig` (macOS), `nsis.zip`+`.sig` / `msi.zip`+`.sig` (Windows); `latest.json` with `version`+`platforms[OS-ARCH].{url,signature}` required — signature cannot be disabled [tauri.app/plugin/updater/](https://tauri.app/plugin/updater/) and [v2.tauri.app/plugin/updater/](https://v2.tauri.app/plugin/updater/) config reference
- Bundling: `tauri build --bundles appimage,deb,rpm` (or `nsis,msi` on Windows); `bundle.resources` must embed versioned payload

---

## 6. CI gates that must be green before tag

Mature CI (bat/ripgrep) enforces **before** tag push:

| Gate | Example |
|---|---|
| **Format + lint** | `cargo fmt -- --check` + `cargo clippy --locked --all-targets --all-features -- -D warnings` [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml) |
| **MSRV job** | `cargo test --locked` on `rust_version` from `Cargo.toml` [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml) |
| **Matrix tests** | Node 20/22/24, Fedora container (real `/proc`), Ubuntu `real-run` valid JSON + zero `checkErrors`; Rust tests with webkit deps; cross-compiled `cross` builds on 13+ targets [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml) · [ripgrep ci.yml](https://github.com/BurntSushi/ripgrep/blob/master/.github/workflows/ci.yml) |
| **Packaging gate** | `npm pack --dry-run \| grep src-gui/index.html` (linux-doctor does this); `cargo package` succeeds [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) |
| **Docs / license / audit** | `cargo doc --locked --no-deps -D warnings`, `cargo audit`, `license-checks.sh`, man page renders [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml) |
| **Workflow lint** | YAML parse gate (linux-doctor `workflow-lint` is analogous) |

Conventional rule: **tag only after branch CI green**; ripgrep and bat both require pushing the version commit first, waiting for CI, then pushing the tag [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) ; [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md).

---

## 7. Security / supply chain

| Control | What it is | How mature projects use it |
|---|---|---|
| **SHA-256 checksums** | `shasum -a 256` file per artifact, often a combined `SHA256SUMS`; consumed by Homebrew/AUR/PKGBUILD `sha256sums` | ripgrep `ci/sha256-releases` → brew formula [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) ; helix `sha256sum` → homebrew [helix releases](https://helix-editor.vercel.app/contributing/releases/) ; bat debs include versioned `control` + `copyright` |
| **GPG-signed tags / artifacts** | `git tag -s` requires configured GPG key [npm version sign-git-tag](https://docs.npmjs.com/cli/v10/commands/npm-version) ; `npm provenance` signs via Sigstore ephemeral certs + transparency log [generating-provenance-statements](https://docs.npmjs.com/generating-provenance-statements) | helix `-s` tag [helix releases](https://helix-editor.vercel.app/contributing/releases/) ; ripgrep "signed tag" [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) |
| **SLSA Build levels** | L0 none → L1 provenance exists → L2 signed provenance on hosted platform → L3 hardened platform (isolated runs, signing key not accessible to build steps) [slsa.dev/spec/v1.0/levels](https://slsa.dev/spec/v1.0/levels) | npm provenance + GitHub-hosted runner achieves ~L2 (hosted + signed provenance) |
| **Sigstore / GitHub Artifact Attestations** | `actions/attest@v4` with `id-token: write` + `attestations: write` (+ `artifact-metadata: write` for storage record), `subject-path` / `subject-checksums`; provenance auto-generated unless `sbom-path` (SBOM) or custom predicate supplied; verification via `gh attestation verify <path> -R org/repo` [github.com/actions/attest](https://github.com/actions/attest) ; docs: [using-artifact-attestations-to-establish-provenance-for-builds](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) ; private Sigstore instance for private repos |
| **npm provenance / trusted publishing** | Sigstore + transparency log; trusted publishing (OIDC) auto-emits provenance, eliminates `NPM_TOKEN` [generating-provenance-statements](https://docs.npmjs.com/generating-provenance-statements) ; [trusted publishing GA](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/) |
| **SBOM attestation** | SPdx/CycloneDX JSON attested via `actions/attest` `sbom-path`, verified with `--predicate-type https://spdx.dev/Document/v2.3` and `--format json --jq` [attestations docs](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) |

---

## 8. Documentation updates that ride a release

- **README** version/MSRV references grepped and bumped (`git grep -i -e 'rust.*1\.' -e '1\..*rust' | grep README` [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md))
- **`CHANGELOG.md`** dated entry — keep `Unreleased` at top, move to `## [x.y.z] - YYYY-MM-DD` on release, then recreate `## [Unreleased]` stub [keepachangelog](https://keepachangelog.com/en/1.1.0/) — bat template: `# unreleased / ## Features / ## Bugfixes ...` [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md)
- **Man page + `--help` parity** verified (bat: "Review `-h`, `--help`, and the `man` page … shown in CI Documentation job" [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md))
- **Generated docs** (`docs/checks.md`, syntax/theme assets) regenerated before tag — bat `assets/create.sh` [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md)
- **Configuration docs / thresholds / AppStream** — helix updates `contrib/Helix.appdata.xml` `<release>` [helix releases](https://helix-editor.vercel.app/contributing/releases/)
- **`--version` output** tested against new tag (bat does `bat --version` should show new version [bat checklist](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md))

---

## 9. Comparison: linux-doctor vs mature projects

| Area | Mature projects (ripgrep / bat / helix / Tauri / npm) | linux-doctor today | Gap |
|---|---|---|---|
| **Version sync** | Bump **all** manifests in one commit (`Cargo.toml`+`Cargo.lock`+`tauri.conf.json`±`package.json`) via script; verify with `cargo check/build` [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) · [helix](https://helix-editor.vercel.app/contributing/releases/) · [tauri#8265](https://github.com/tauri-apps/tauri/issues/8265) | `RELEASING.md` (root) lists only `package.json`+man; `docs/RELEASING.md` lists 3 JSON/TOML files but `Cargo.lock` update not mentioned as explicit step; historically `package-lock.json` drifted (`0.3.3→0.3.4` fix noted) | **High** — add single `scripts/bump-version.mjs` + `Cargo.lock` regeneration; CI assertion that `package.json`/`tauri.conf.json`/`Cargo.toml` versions match tag |
| **CHANGELOG** | Keep a Changelog + SemVer, dated header, `Unreleased` stub, changelog curated from `git log` but not auto-dumped [keepachangelog](https://keepachangelog.com/en/1.1.0/) · [semver](https://semver.org/) | Follows both (header already `## [x.y.z] — YYYY-MM-DD`, sections `Added/Changed/Fixed/Security`); recent `release.yml` now uses `CHANGELOG` extraction; `Unreleased` present | **Low** — ensure every release creates fresh `## [Unreleased]` stub (bat pattern) |
| **Signed tag** | `git tag -s -a vX.Y.Z` (GPG) [helix](https://helix-editor.vercel.app/contributing/releases/) · [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) · `npm version --sign-git-tag` [npm-version](https://docs.npmjs.com/cli/v10/commands/npm-version) | Unsigned `git tag vX.Y.Z` per both RELEASING docs | **Medium** — configure GPG + `sign-git-tag` or explicit `git tag -s` |
| **CI gates before tag** | `fmt`+`clippy -D warnings`+MSRV+`cargo audit`+`cargo doc -D warnings`+license checks+multi-target build+`cargo package` [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml) | `workflow-lint` → matrix Node 20/22/24 + Fedora + `cargo test` + `real-run` valid JSON + `npm pack --dry-run` packaging gate — **creatively strong for JS**; missing `clippy -D warnings`, `cargo audit`, `cargo fmt` for Rust side, no `npm audit` | **Medium** — add `cargo fmt/clippy/audit` jobs |
| **Packaging dry-run** | `cargo publish --dry-run` / `cargo package` [bat](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md) · [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) ; `npm pack --dry-run` [npm-publish](https://docs.npmjs.com/cli/v10/commands/npm-publish) | `npm pack` is the release artifact; dry-run gate only checks `src-gui/index.html` presence; no `cargo publish --dry-run` equivalent for Tauri side | **Low/Medium** |
| **GitHub Release notes** | Copy `CHANGELOG` section verbatim [bat](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md) · [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) or use `generate_release_notes` via `.github/release.yml` categories [auto-generated notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes) | Since 0.3.4: extracts `CHANGELOG` section via `awk` + `softprops/action-gh-release` `body_path` + `generate_release_notes: false` (correct) | **None** |
| **Artifacts** | tarball + per-target archives + deb/rpm + `SHASUMS` + Homebrew hash update [bat CICD.yml](https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml) · [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) | `linux-doctor-X.Y.Z.tgz` + `AppImage`+`deb`+`rpm` attached to same Release (since 0.3.4); **no** `SHA256SUMS` file, **no** Homebrew/AUR hash automation | **Medium** — generate `SHA256SUMS` and publish |
| **npm provenance** | `npm publish --provenance` with `id-token: write` + OIDC trusted publisher → Sigstore + transparency log [provenance](https://docs.npmjs.com/generating-provenance-statements) ; GA trusted publishing auto-provenance [trusted-publishing GA](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/) | CLI tarball attached to GitHub Release only; **no** `npm publish` at all (and thus no provenance) — `packaging/README.md` says "npm publish" is expected but workflow does not run it | **High** — decide npm distribution; if publishing, add OIDC trusted publisher + `npm publish --provenance` job |
| **Binary attestations** | `actions/attest@v4` with `attestations: write` + `id-token: write`, `gh attestation verify` [attest action](https://github.com/actions/attest) · [attestations docs](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) | Not used | **Medium/High** — add attestation for each Release asset (SLSA L2) |
| **Checksums / SBOM** | SHA-256 per artifact + optional SPDX SBOM attestation via `sbom-path` [attest](https://github.com/actions/attest) | None | **Medium** |
| **Tauri updater** | `createUpdaterArtifacts:true`, keypair, `latest.json` with `signature` per platform, mandatory verification [updater plugin](https://tauri.app/plugin/updater/) | No updater configured; `tauri.conf.json` `version` is static `0.3.4` string, not updater-ready; `bundle.resources` works | **Low now** (no auto-update channel); would be **High** if auto-updates are planned |
| **Completions / man / docs** | Re-generated and committed before tag [bat](https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md) | Completions exist (`completions/*.bash|zsh|fish`) but no script to regenerate from source; `packaging/linux-doctor.1` versioned but drifted historically; `docs/checks.md` **is** generated via `scripts/generate-check-docs.mjs` — good | **Low** — add `completions` + `man` regeneration to bump script |
| **Tag workflow discipline** | Push version commit → wait CI green → push signed tag; deleting tag+release on failure [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) | `release.yml` triggers on `v*` push (both CLI+GUI jobs); no explicit "wait for main CI green" gate documented | **Low** — document two-phase push |
| **Post-release** | Yank policy, `cargo owner` teams, dependents graph, security advisory if needed [publishing.html](https://doc.rust-lang.org/cargo/reference/publishing.html) · [about-releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) | No crates.io; no `npm deprecate`/`yank` runbook | **Low** |

---

## 10. What to adopt next (priority order)

1. **Single bump script** — one command bumps `package.json` + `package-lock.json` + `src-tauri/tauri.conf.json` + `src-tauri/Cargo.toml` + `Cargo.lock` + `packaging/linux-doctor.1` + `PKGBUILD`/`spec` and runs `scripts/generate-check-docs.mjs`; CI asserts all versions equal tag (prevents recurring drift).
2. **Signed tags** — set `sign-git-tag=true` or `git tag -s` and document GPG setup; aligns with ripgrep/helix.
3. **`SHA256SUMS` + Homebrew/AUR hash automation** — `sha256sum` all Release assets, attach `SHA256SUMS` to Release, update `PKGBUILD` `sha256sums` note.
4. **Supply-chain level 2** — if publishing to npm: configure npm trusted publisher (OIDC) and `npm publish --provenance`; for binaries: add `actions/attest@v4` on `release.yml` assets (`id-token`/`attestations`/`artifact-metadata`).
5. **Harden CI** — add `cargo fmt --check`, `cargo clippy -D warnings`, `cargo audit` jobs to mirror bat's gates.
6. **Tauri updater decision** — if auto-updates desired, generate keypair, set `plugins.updater.pubkey` + `createUpdaterArtifacts` + `endpoints` → emits `latest.json` + `.sig` per platform.

---

## Sources (high-trust only)

- ripgrep release checklist — <https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md>
- ripgrep CI workflow — <https://github.com/BurntSushi/ripgrep/blob/master/.github/workflows/ci.yml>
- bat release checklist — <https://github.com/sharkdp/bat/blob/master/doc/release-checklist.md>
- bat CICD workflow — <https://github.com/sharkdp/bat/blob/master/.github/workflows/CICD.yml>
- helix releases — <https://helix-editor.vercel.app/contributing/releases/>
- Tauri config `version` field — <https://v2.tauri.app/reference/config/>
- Tauri updater plugin (signing, artifacts, `latest.json`) — <https://tauri.app/plugin/updater/> / <https://v2.tauri.app/plugin/updater/>
- Tauri version-sync issue — <https://github.com/tauri-apps/tauri/issues/8265>
- npm provenance — <https://docs.npmjs.com/generating-provenance-statements>
- npm publish — <https://docs.npmjs.com/cli/v10/commands/npm-publish>
- npm version (incl. `sign-git-tag`) — <https://docs.npmjs.com/cli/v10/commands/npm-version>
- Cargo publishing — <https://doc.rust-lang.org/cargo/reference/publishing.html>
- GitHub About releases — <https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases>
- GitHub automatically generated release notes — <https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes>
- GitHub artifact attestations (usage) — <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations>
- GitHub artifact attestations overview — <https://docs.github.com/en/actions/concepts/security/artifact-attestations>
- actions/attest — <https://github.com/actions/attest>
- npm trusted publishing (OIDC) GA — <https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/>
- SLSA levels — <https://slsa.dev/spec/v1.0/levels>
- Keep a Changelog — <https://keepachangelog.com/en/1.1.0/>
- SemVer — <https://semver.org/>
