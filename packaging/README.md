# Packaging

linux-doctor is pure Node.js with zero runtime dependencies, which makes it
trivial to package. This directory holds the starting points; the canonical
artifact for every channel is the npm tarball from `npm pack` at a release
tag (it ships `bin/`, `src/`, and `src-gui/index.html` — the page the `--web`
dashboard needs at load time).

## Build the tarball

`npm pack` produces a `.tgz` whose contents live under a `package/` directory
(it does not extract to `linux-doctor-$VERSION/`). Both the PKGBUILD and the
RPM spec in this directory already account for that layout — `-n package` in
%setup, `$srcdir/package` in `package()`. If you prefer a plain root tar
instead, repack it:

```bash
VERSION=0.2.0
npm pack
tar -xzf linux-doctor-$VERSION.tgz
mv package linux-doctor-$VERSION
tar -czf linux-doctor-$VERSION.tar.gz linux-doctor-$VERSION
rm -rf linux-doctor-$VERSION
```

## Arch Linux (AUR)

`PKGBUILD` installs to `/usr/lib/linux-doctor` and symlinks
`/usr/bin/linux-doctor`. To publish:

```bash
git clone ssh://aur@aur.archlinux.org/linux-doctor.git /tmp/aur
cp packaging/PKGBUILD /tmp/aur/
# fill in the real sha256sums, then:
cd /tmp/aur && makepkg -f && makepkg --printsrcinfo > .SRCINFO
git add . && git commit -m "linux-doctor 0.2.0" && git push
```

## Fedora / RHEL (COPR)

`linux-doctor.spec` is a working noarch spec. To build on COPR:

```bash
copr-cli create linux-doctor --chroot fedora-42-x86_64
copr-cli build linux-doctor packaging/linux-doctor.spec \
  --srpm --spec packaging/linux-doctor.spec --git-url https://github.com/zShaD0w7x/linux-doctor-cli
```

(Or drop the tarball into `~/rpmbuild/SOURCES/` and `rpmbuild -ba` locally.)

## Debian/Ubuntu

A `deb` needs a proper maintainer setup (`debian/` control files + `dpkg-buildpackage`).
The easiest path for now: the npm tarball plus a `/usr/bin` symlink, or a
`.deb` generated from the same layout as the RPM spec (install to
`/usr/lib/linux-doctor`).

## GUI: .desktop launcher

The Tauri app (`npm run gui:build`) produces a binary named `linux-doctor` and
the deb/rpm bundles it generates carry their own `.desktop` entry. For the
AppImage (which has no menu entry by default) or manual installs, ship the
launcher in this directory:

```bash
install -Dm644 packaging/linux-doctor.desktop ~/.local/share/applications/linux-doctor.desktop
install -Dm644 src-tauri/icons/128x128.png ~/.local/share/icons/hicolor/128x128/apps/linux-doctor.png
update-desktop-database ~/.local/share/applications 2>/dev/null || true
```

The desktop file expects the `linux-doctor` GUI binary on `PATH`, and the app
itself needs `node` on `PATH` (see the README) to run the checks.

## No Node on the target? (optional)

For environments without Node ≥ 20, `bun build --compile bin/doctor.js -o linux-doctor`
produces a single self-contained binary (evaluate size/startup before
committing to it). Node remains the primary, tested runtime.

## Release checklist (maintainers)

1. Bump `version` in `package.json`, add a `CHANGELOG.md` entry.
2. Tag `v<version>` — the `release.yml` workflow tests, packs, and attaches
   the tarball to a GitHub Release.
3. From that tarball, publish AUR / COPR / deb using the files here.
4. `npm publish` (the package ships everything the runtime needs — the
   `packaging gate` CI step guards the `files` list).
