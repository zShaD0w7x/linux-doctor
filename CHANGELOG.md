# Changelog

All notable changes to Linux Doctor are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

### Changed

- **Severity rubric enforced (Faza 1 — findings trust)**: new
  [docs/severity.md](docs/severity.md) defines when a finding is high /
  medium / info, and `tests/codes-registry.test.js` pins every built-in code
  to its allowed severity set + category. Four findings were realigned with
  the rubric — degradation without data risk is **medium**, not high:
  `gpu/software-rendering`, `wayland/software-rendering`,
  `gpu/nvidia-missing`, `processes/high`. Machines that scored on these will
  see their health score improve; history keeps working (scores are
  recomputed per run).
- **Code discipline is mechanical**: every builtin `code:` must be a string
  literal (`^[a-z0-9-]+/[a-z0-9-]+$`, ternaries of literals allowed), titles
  carry no trailing period and stay short, and `evidence: null` is only
  allowed on the reviewed data-absence list (`battery/none`, `gpu/skipped`,
  `updates/skipped`). The slug-derived fallback code now exists solely as a
  plugin escape hatch.
- **Health score escalation**: penalties now compound within a severity tier —
  the n-th high-severity finding costs 15 + 5·(n−1), and medium findings past
  the third cost +1 each. Previously 4 high (score 40) and 7 medium (44)
  scored almost identically; now they land at 10 vs 34, so critical issues
  stand clearly apart from a pile of minor ones. Low counts are unchanged
  (one high is still 85, one medium still 92).
- **`--push` / `--alert` URL validation**: mistyped endpoints (missing
  `https://`, wrong scheme, no host) now fail fast with a clear message and
  exit 2, before any checks run — instead of a generic fetch error after a
  full run or mid-daemon-cycle.
- **Consistent repository URLs**: every reference to the old
  `linux-doctor-cli` repo name (package.json, PKGBUILD, RPM spec, report
  footer, GUI "Report wrong" link, commercial license) now points to
  `zShaD0w7x/linux-doctor`.
- **Distro-specific fixes**: `pkgInstall()` accepts per-distro package-name
  maps, and the `memory`, `network` and `smart` checks now emit the install
  command for the detected distro instead of enumerating alternatives.

### Added

- **Safe fixes (`--fix`)**: a dry-run plan of concrete commands for the
  findings on the system, built from a small built-in catalog (`src/fix.js`)
  mapped to stable finding codes — failed services, broken timers, pending
  updates (per package family, `rpm-ostree` on image-based systems), flatpak,
  snap, disabled fstrim, oversized journal. `--fix --yes` executes only the
  `[apply]` commands after a second opt-in; `[manual]` entries (e.g. reboot)
  are never executed.
- **Interactive mode (`--interactive`)**: zero-dependency terminal UI over the
  report — arrow keys pick a finding, Enter opens details/evidence, `c` copies
  the fix (wl-copy/xclip/pbcopy with OSC 52 fallback), `f` copies the safe-fix
  command. Falls back to the printed report without a TTY.
- **Desktop notifications (`--notify`)**: native `notify-send` notification
  when new medium/high findings appear; also honored by `--daemon`.
- **Score trend in the terminal**: a `TREND` sparkline (`▄▅▆▇`) of recent runs
  (capped to 20) in both the full report and `--plain` (`# trend:` comment).
- **▶ START HERE**: the report now calls out the single most useful next
  action between the summary and the findings. The web dashboard and static
  HTML export get the same banner with Copy-fix / Show buttons.
- **Category clustering**: findings are grouped by their check's category
  within each severity section, each numbered line carrying a `[category]`
  tag.
- **Shell-injection guardrail test**: a static test (`tests/shell-safety.test.js`)
  fails the suite if any command template interpolates a value without `shq()`,
  so the existing quoting discipline is enforced mechanically.
- **`npx github:zShaD0w7x/linux-doctor`**: documented zero-install trial path
  (the corrected repo URLs make it work).
- **Checks**: `fstrim` (SSD TRIM health — weekly `fstrim.timer`, continuous
  `discard` mounting, or a medium finding when SSDs are never trimmed).

### Changed

- **Security hardening** (web dashboard): non-loopback `Host` headers are
  rejected (DNS rebinding) and cross-origin POSTs to config-writing endpoints
  are rejected (CSRF).
- **Static HTML reports** embed data as `window.__DATA__` instead of
  monkey-patching `window.fetch`; save buttons now fail honestly in static files.
- **Shell safety**: every value interpolated into a spawned command is
  single-quoted (`shq`) so crafted names cannot break out of their argument.

## [0.3.0] - 2026-08-18

### Added

- **Checks**: `containerdisk` (container image storage via podman/docker),
  `crash` (reboot frequency + coredumps via journalctl and coredumpctl).
- **Shell completions**: bash, zsh, and fish completions in `completions/`.
- **Systemd timer**: `linux-doctor.timer` + `.service` for automated daily
  checks (see [packaging/](packaging/)).
- **HTML export**: `--html <path>` saves a standalone HTML report you can
  open in any browser or share on Slack.
- **`--summary`**: one-liner output with score + severity counts, designed
  for cron jobs and shell prompts (`score=72 high=1 medium=3 info=12`).
- **`--init-config`**: creates a starter config file at
  `~/.config/linux-doctor/config.json` with commented thresholds and
  examples — no more guessing what keys exist.
- **`--check-list`**: prints check metadata as JSON (id, title, category,
  appliesTo, appliesHere) — useful for dashboards and fleet tooling.
- **`--compare <file>`**: diffs a previous JSON report against the current
  run, showing new and fixed findings side by side.
- **DNS speed check**: the `network` check now times DNS resolution; slow
  resolvers (>500ms) are flagged as medium severity.
- **Man page**: `linux-doctor(1)` with full option docs, exit codes, and
  file locations (see `packaging/linux-doctor.1`).
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
- Dashboard: a **Report wrong** button on every finding opens a pre-filled
  GitHub issue (title, code, check, version) — the false-positive feedback
  loop.
- CI: a **real-run** job executes the full `--json` report on a live ubuntu
  runner and asserts valid JSON with zero `checkErrors`; the Fedora container
  job runs the same smoke test against its real `/proc` and `/sys`.
- Journal findings are flagged `low` confidence (heuristic log matching may
  produce false positives).

#### History, support bundle, atomic awareness, dashboard trend

- **History is now central**: every run is diffed against the previous one and
  reports `newCount` / `fixedCount` / `unchanged` plus a plain-language
  `changeMessage` ("Since last run: 2 new, 1 fixed", or "no change since last
  check"). `--summary` and the JSON report carry these; `--no-history` (or
  `LINUX_DOCTOR_NO_HISTORY`) disables history recording for a one-off run.
- **`--support`**: writes a single, privacy-scrubbed support bundle
  (`linux-doctor-support-<timestamp>.json`) with system facts, the active
  config, recent findings, and a capped copy of history. IP addresses and
  `/home/<user>` paths are redacted; the bundle documents exactly what it
  excludes under `privacy.excluded`.
- **Immutable / atomic distro awareness**: `system.atomic` reports
  `immutable`, `imageBased`, `bootc`, `variant`, and `pkg`. Checks that do not
  apply to image-based systems (e.g. `reboot`) are skipped and listed in
  `skippedChecks` / `checksAtomicSkipped` (and surfaced in the dashboard's
  Skipped section) instead of producing misleading findings.
- **Dashboard trend graphs**: the history view now draws the health-score
  sparkline (with date tooltips and a dashed 50-point attention line) plus a
  new stacked-bar chart of high/medium/info findings across recent runs.

### Changed

- **Repositioned messaging around the core promise** — finds real problems, explains them in plain English, and remembers what changed between runs. The README now leads with that promise (not a feature list); the terminal report and `--summary` lead with `STATUS` and a `SINCE LAST RUN` change line (new/fixed/unchanged); the `--plain` report gains a `# since:` line; and the dashboard hero surfaces "Since last run" next to the health score. No feature/behavior change to the checks themselves.
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

### Fixed

- Packaging: the PKGBUILD and RPM spec now build from the real `npm pack`
  tarball layout (`package/`), which previously failed at `%setup`/`cp` time;
  `diffSinceLast` entries expose the stable `code` in the v1 JSON schema.
- **NEW badge** printed the literal template string `${A.bold}` instead of the
  ANSI code it was meant to reference — the badge now renders as actual colored
  output.
- **Thermal** check matched any log line containing "throttl" — e.g. Roblox's
  `setStartupThrottle` — and falsely reported CPU throttling. The pattern now
  requires `clock throttl` and a kernel-tagged log source.
- **Journal** check escalated thousands of benign but unrecognized error-level
  entries into a medium "noteworthy errors" finding. Noise patterns now cover
  X.509 certs, ELF architecture, i2c address, rpm-ostree metadata, and
  libseccomp lines; unrecognized entries are informational, never medium.
- **GPU** check reported a kernel-built-in driver (absent from `lsmod`) as
  "driver not loaded" even with a working display — a built-in driver plus a
  working display is now fine.
- **Updates** check could print "System is up to date" when `apt` actually
  failed (dpkg lock, `E:` errors). Apt failures now stay silent instead of
  pretending the system is clean.
- **Severity**: missing optional hardening — no LUKS encryption, Secure Boot
  off, no TPM, no firewall, no backup tool/schedule — is informational, not
  medium. A healthy default install is no longer penalized in the health score.

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
