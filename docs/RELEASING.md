# Releasing

How a version goes from this repo to downloadable artifacts on
<https://github.com/zShaD0w7x/linux-doctor/releases>.

## What CI builds automatically

Pushing a tag `vX.Y.Z` triggers `.github/workflows/release.yml`:

| Job | Runs on | Produces |
|---|---|---|
| **cli** | ubuntu-latest | `linux-doctor-X.Y.Z.tgz` (npm pack, after `npm test`) + `SHA256SUMS` |
| **gui** | ubuntu-22.04 | `Linux.Doctor_X.Y.Z_amd64.AppImage`, `linux-doctor_X.Y.Z_amd64.deb`, `linux-doctor_X.Y.Z_amd64.rpm` + `SHA256SUMS` |

Both jobs attach their files to the same GitHub Release. Release notes are
extracted verbatim from `CHANGELOG.md` via `awk` (body_path), not auto-generated. Each asset gets a Sigstore attestation via `actions/attest`. The gui job builds on 22.04 on
purpose: the AppImage links against an older glibc, so it runs on most
distributions.

## Cut a release (with signed tag + SHA256SUMS)

```bash
# 0. one-time GPG setup (see /RELEASING.md)
# 1. bump all manifests atomically + regenerate docs:
node scripts/bump-version.mjs 0.4.0
# 2. curate CHANGELOG.md: move [Unreleased] -> ## [0.4.0] - YYYY-MM-DD
npm run goldens:update   # if output changed
npm test                 # must be green (439 tests)
npm pack --dry-run | grep src-gui/index.html
node bin/doctor.js --self-test && node bin/doctor.js --json | jq .checksRun

git commit -am "chore: release 0.4.0"
git push origin main              # wait for CI green (Node 20/22/24 + Fedora + Rust)
git tag -s v0.4.0 -m "v0.4.0" && git tag -v v0.4.0
git push origin v0.4.0            # triggers release.yml -> tgz + AppImage/deb/rpm + SHA256SUMS + attestations
# 3. verify Release: SHA256SUMS, CHANGELOG body, --version matches tag
```

## Build the GUI locally (optional)

Needs WebKitGTK/GTK3 dev libraries, which immutable systems (Bazzite,
Silverblue) do not expose directly. Use a toolbox container — inside it you
have passwordless sudo:

```bash
toolbox -y create -c ldbuild
toolbox run -c ldbuild -- bash -lc '
  sudo dnf install -y nodejs npm rust cargo \
    webkit2gtk4.1-devel gtk3-devel librsvg2-devel file patchelf openssl-devel'
cd <repo>
toolbox run -c ldbuild -- bash -lc 'npm ci && npm run build:gui && npx tauri build --bundles deb'
```

Artifacts land in `src-tauri/target/release/bundle/deb/`.

Two gotchas learned the hard way:

- **Run what you built inside the same container** (`toolbox run -c ldbuild
  -- ./src-tauri/target/release/linux-doctor` with
  `WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000`). A binary
  compiled against the container's WebKitGTK crashes on the host's older
  libs (`free(): corrupted unsorted chunks`).
- **AppImage bundling may fail on bleeding-edge Fedora containers**: the
  `strip` shipped inside linuxdeploy rejects modern `.relr.dyn` ELF sections
  found in current Fedora libraries (`unknown type [0x13]`). Exporting
  `APPIMAGE_EXTRACT_AND_RUN=1` is required regardless (no FUSE), but does
  not fix strip. Practical split: build **deb locally**, let **CI produce
  the AppImage** on ubuntu-22.04.

## Node runtime resolution

The desktop shell runs the Node CLI under the hood. It picks the interpreter
in this order: `$LINUX_DOCTOR_NODE`, `<resources>/runtime/node` (a runtime
dropped into the package by future release packaging), then `node` from
PATH. Today the app therefore needs Node.js ≥ 20 installed — bundling a
runtime into `.deb`/`.AppImage` is the planned follow-up so end users need
nothing on their PATH.

## Asset naming convention

```
Linux-Doctor_0.3.0_amd64.AppImage     # primary download
linux-doctor_0.3.0_amd64.deb          # Debian/Ubuntu alternative
linux-doctor-0.3.0.tgz                # npm CLI tarball
```

## Release notes (minimum)

```
🩺 Linux Doctor v0.3.0

Download `Linux-Doctor_0.3.0_amd64.AppImage`, then:
  chmod +x Linux-Doctor_*_amd64.AppImage && ./Linux-Doctor_*_amd64.AppImage

CLI users: npx github:zShaD0w7x/linux-doctor  (Node ≥ 20)
Read-only diagnostics — it never modifies your system.
```
