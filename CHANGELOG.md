# Changelog

All notable changes to Linux Doctor are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Checks**: `containerdisk` (container image storage via podman/docker),
  `crash` (reboot frequency + coredumps via journalctl and coredumpctl).
- **Shell completions**: bash, zsh, and fish completions in `completions/`.
- **Systemd timer**: `linux-doctor.timer` + `.service` for automated daily
  checks (see [packaging/](packaging/)).
- **HTML export**: `--html <path>` saves a standalone HTML report you can
  open in any browser or share on Slack.

### Added

- **`--severity <level>`**: filter output to show only high, medium, or info
  findings (scoring and fleet push always use the full set).
- **`--ignore-code <code>`**: ignore findings by stable code (e.g.
  `services/failed`) instead of fragile title substrings; works alongside
  `--ignore` and the config file's `ignoreCodes` array.
- **`--ignore-list`**: shows all configured ignore patterns (title + code)
  and exits.
- **Terminal colors**: severity headers are now ANSI-colored (red/yellow/blue)
  when stdout is a TTY.
- **NEW badge**: findings new since the last check now show `🆕 NEW` instead
  of the subtle `(new)` marker.

### Changed

- **Stable finding codes**: every count-bearing finding (services, journal,
  updates, flatpak, firmware, timers, disk, memory, network, ntp, audio,
  thermal, smart, journald) now carries an explicit stable `code`, and the
  history diff matches findings by code (falling back to title for older
  history). "New/fixed since last check" no longer churns when a count in a
  title changes between runs.
- **Explicit skips**: checks that cannot run because a tool is missing
  (`free`, `journalctl`, `smartctl`, `timedatectl`, `ip`, `pactl`, a package
  manager, thermal zones) now report an informational "check skipped"
  finding instead of silently returning "all clear".
- **Dedupe**: disk findings share one `dedupeKey` per backing device, so
  btrfs/ZFS subvolumes of the same pool are scored once; the journal check
  defers unit-failure lines to the services check (one problem, one finding).

### Added

- Dashboard: a **Report wrong** button on every finding opens a pre-filled
  GitHub issue (title, code, check, version) — the false-positive feedback
  loop.
- CI: a **real-run** job executes the full `--json` report on a live ubuntu
  runner and asserts valid JSON with zero `checkErrors`; the Fedora container
  job runs the same smoke test against its real `/proc` and `/sys`.
- Journal findings are flagged `low` confidence (heuristic log matching may
  produce false positives).

### Fixed

- Packaging: the PKGBUILD and RPM spec now build from the real `npm pack`
  tarball layout (`package/`), which previously failed at `%setup`/`cp` time;
  `diffSinceLast` entries expose the stable `code` in the v1 JSON schema.

## [0.2.0] - 2026-08-18

### Added

- **Checks**: `network` (default route + DNS), `reboot` (newer kernel installed
  but not booted, `/var/run/reboot-required`), `journald` (journal disk usage),
  `smart` (SMART disk health, graceful without root), `timers` (enabled systemd
  timers that never run), `ntp` (time synchronization), battery capacity wear.
- **JSON v1 schema**: `schemaVersion`, `tool`, `version`, `durationMs`;
  every finding carries `check` and a stable `code`; `--schema` prints the
  JSON Schema document for validators and fleet servers.
- **History diff**: atomic history writes; `diffSinceLast` (`added`/`fixed`)
  in JSON and a "fixed since last check" line in the terminal and `--plain`
  output.
- **Check metadata**: `defineCheck` with `category` and `appliesTo`
  (desktop/laptop/server); `--list` and `--help` group checks by category and
  mark checks that do not apply to the current machine; a full run skips
  irrelevant checks (`--check` always overrides).
- **Plugins**: drop-in checks in `~/.config/linux-doctor/checks/`
  (`LINUX_DOCTOR_PLUGINS` to override) — any `.js` file exporting
  `{ id, run }` becomes a check.
- **Configurable thresholds**: `"thresholds"` in `config.json` tunes every
  severity boundary (disk %, memory ratio, load, temperature, RAM share,
  journal size).
- **Performance**: checks run through a concurrency pool (bounded
  subprocesses); `--profile` reports per-check durations.
- **CLI hygiene**: strict argument parsing (unknown flags and missing values
  exit 2), `--check=id` form, `--push` payload now carries `machineId` and
  `diffSinceLast`.
- **Packaging**: AUR `PKGBUILD`, RPM spec, release workflow, this changelog.
- **CI**: Node 20/22/24 matrix, a Fedora container job, and an npm pack gate
  that guards the published `files` list.

### Fixed

- npm package crashed on every invocation: `src-gui/index.html` (read by
  `web.js` at import time) is now in `files`.
- Same root cause reported twice (journal+suspend, gpu+wayland) and double
  penalized in the health score — now deduplicated via `dedupeKey` and
  deferred patterns.
- `ps -o comm` truncated process names (15 chars) so the friendly-name map
  never matched — now uses `args=`.
- `journalctl` boot separators inflated log checks — filtered in one place.
- `addIgnore` used to overwrite other config keys (e.g. thresholds) — it
  merges now.
- Wireless-device "batteries" (Logitech receivers, controllers) no longer
  report as laptop batteries or mark a desktop as a laptop.
- `systemd list-timers` column parsing was fragile — now slices by the
  header's column offsets.
- `tests/web.test.js` flaked (server banner corrupted the TAP stream) —
  `startWeb` gained a `quiet` option used by tests.
