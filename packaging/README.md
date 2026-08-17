# Packaging

linux-doctor is pure Node.js with zero runtime dependencies, which makes it
trivial to package. This directory holds the starting points; the canonical
artifact for every channel is the npm tarball from `npm pack` at a release
tag (it ships `bin/`, `src/`, and `src-gui/index.html` — the page the `--web`
dashboard needs at load time).

## Build the tarball

```bash
VERSION=0.1.0
npm pack
mv linux-doctor-*.tgz linux-doctor-$VERSION.tar.gz
```

## Arch Linux (AUR)

`PKGBUILD` installs to `/usr/lib/linux-doctor` and symlinks
`/usr/bin/linux-doctor`. To publish:

```bash
git clone ssh://aur@aur.archlinux.org/linux-doctor.git /tmp/aur
cp packaging/PKGBUILD /tmp/aur/
# fill in the real sha256sums, then:
cd /tmp/aur && makepkg -f && makepkg --printsrcinfo > .SRCINFO
git add . && git commit -m "linux-doctor 0.1.0" && git push
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
