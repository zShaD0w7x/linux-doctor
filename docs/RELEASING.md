# Releasing

How a version goes from this repo to downloadable artifacts on
<https://github.com/zShaD0w7x/linux-doctor/releases>.

## What CI builds automatically

Pushing a tag `vX.Y.Z` triggers `.github/workflows/release.yml`:

| Job | Runs on | Produces |
|---|---|---|
| **cli** | ubuntu-latest | `linux-doctor-X.Y.Z.tgz` (npm pack, after `npm test`) |
| **gui** | ubuntu-22.04 | `linux-doctor_X.Y.Z_amd64.AppImage`, `linux-doctor_X.Y.Z_amd64.deb` |

Both jobs attach their files to the same GitHub Release. Release notes are
auto-generated (`generate_release_notes`). The gui job builds on 22.04 on
purpose: the AppImage links against an older glibc, so it runs on most
distributions.

## Cut a release

```bash
# 1. bump all three versions to X.Y.Z:
#    package.json · src-tauri/tauri.conf.json · src-tauri/Cargo.toml (+ Cargo.lock)
npm run build:gui          # regenerate the dashboard bundle
npm test                   # must be green before tagging
git commit -am "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main --follow-tags   # CI does the rest (~10 min first run)
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
toolbox run -c ldbuild -- bash -lc 'npm ci && npm run build:gui && npx tauri build --bundles appimage'
```

Artifacts land in `src-tauri/target/release/bundle/appimage/`.

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
