# Releasing

How to cut a new Linux Doctor release. The GitHub release workflow runs on
push of a `v*` tag. Version strings must be bumped **before** tagging — use
the single bump script so nothing drifts.

## One-time setup: GPG signed tags

Mature releases use `git tag -s` (like ripgrep/helix). Configure once:

```bash
gpg --full-generate-key   # RSA 4096, no expiry
git config --global user.signingkey <KEYID>
git config --global commit.gpgsign false
git config --global tag.gpgsign true
# or: npm config set sign-git-tag true
gpg --export --armor <KEYID>  # add to GitHub > Settings > SSH and GPG keys
```

Verify: `git tag -s v0.0.1 -m "test" && git tag -v v0.0.1 && git tag -d v0.0.1`

## Checklist (8 steps + supply-chain)

1. **Bump versions atomically:** `node scripts/bump-version.mjs 0.4.0`
   — updates `package.json` + `package-lock.json` + `src-tauri/Cargo.toml` + `src-tauri/tauri.conf.json` + `packaging/linux-doctor.1` (date+version) + `packaging/PKGBUILD` + `packaging/linux-doctor.spec` and regenerates `docs/checks.md`.
2. **Curate `CHANGELOG.md`:** move `[Unreleased]` to `## [0.4.0] - YYYY-MM-DD` with `Added/Changed/Fixed/Security` (Keep a Changelog + SemVer). Keep a fresh `## [Unreleased]` stub at top. Release notes are extracted verbatim via `awk` in `release.yml`.
3. **Regenerate + verify:** `npm run goldens:update` if output changed, `npm test` must be green (439 tests), `npm pack --dry-run | grep src-gui/index.html`, smoke `node bin/doctor.js --self-test` and `node bin/doctor.js --json | jq .checksRun`.
4. **Commit:** `git commit -am "chore: release 0.4.0"` — includes bump + changelog + generated docs.
5. **Push branch first, wait for CI green:** `git push origin main` → check `.github/workflows/ci.yml` (Node 20/22/24 + Fedora + Rust + real-run) green before tagging. This is the two-phase discipline from ripgrep/bat.
6. **Signed tag:** `git tag -s v0.4.0 -m "v0.4.0" && git tag -v v0.4.0` then `git push origin v0.4.0`. Never `git push --follow-tags` in one step — Actions may miss the tag.
7. **GitHub Release:** `release.yml` creates the Release, attaches `linux-doctor-*.tgz` + `AppImage`/`deb`/`rpm` + auto-generates `SHA256SUMS` and Sigstore attestations. Verify `SHA256SUMS` and that `CHANGELOG` section appears as body. Confirm tarball: `tar -tzf dist/*.tgz | grep linux-doctor.1` and `--version` matches tag.
8. **Post-release:** `npm publish --provenance` if publishing to npm (OIDC trusted publisher), update `PKGBUILD` `sha256sums` from `SHA256SUMS`, open next `## [Unreleased]` if not present.

> Drift guard: `scripts/bump-version.mjs` prevents the usual mistake — the man page and `Cargo.lock` used to drift silently. CI now asserts versions match the tag.

## Desktop bundles (AppImage / deb / rpm)

The same tag triggers the `gui` job in `.github/workflows/release.yml`,
which builds `Linux.Doctor_<ver>_amd64.AppImage` + `deb` + `rpm` on ubuntu-22.04 and attaches them to the same
GitHub Release — no extra steps. `SHA256SUMS` and attestations cover all assets. Full details, including how to build the
GUI bundles locally (toolbox container for immutable systems), live in
[docs/RELEASING.md](docs/RELEASING.md).