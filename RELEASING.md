# Releasing

How to cut a new Linux Doctor release. The GitHub release workflow runs on
push of a `v*` tag, but the version strings in the repo are not automated —
they must be bumped by hand and committed **before** tagging.

## Checklist

1. **Bump the version** in `package.json`.
2. **Bump the man page version** in `packaging/linux-doctor.1` (the `.TH`
   line, e.g. `"linux-doctor 0.4.0"`) and its date.
3. **Update `CHANGELOG.md`** under `## [x.y.z]` following Keep a Changelog
   (one `Added` / `Changed` / `Fixed` section each).
4. Run the full suite: `npm test` (must be green).
5. Run a smoke test: `node src/cli.js --self-test` and a real `node src/cli.js`.
6. Commit: version bump, man page, changelog — e.g. `chore: release 0.4.0`.
7. Tag it: `git tag v0.4.0 && git push origin v0.4.0`.
8. The `release.yml` workflow runs `npm test`, packs `linux-doctor-<ver>.tgz`
   from the tag, and creates the GitHub release. Confirm the tarball's man page
   and `--version` report the new version before announcing.

> The man page version is the one people most often forget: the release
> workflow cannot detect it, so a stale `linux-doctor.1` ships silently.

## Desktop bundles (AppImage / deb)

The same tag also triggers the `gui` job in `.github/workflows/release.yml`,
which builds `Linux.Doctor_<ver>_amd64.AppImage` (priority download) and
`Linux.Doctor_<ver>_amd64.deb` on ubuntu-22.04 and attaches them to the same
GitHub Release — no extra steps. Full details, including how to build the
GUI bundles locally (toolbox container for immutable systems), live in
[docs/RELEASING.md](docs/RELEASING.md).