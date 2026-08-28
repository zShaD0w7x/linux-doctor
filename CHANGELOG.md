# Changelog

All notable changes to Linux Doctor are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

## [0.4.0] — 2026-08-28

### Added

- **`--md <path>` — share-ready Markdown export.** One flag writes a
  paste-ready Markdown report (START HERE, severity sections with stable
  codes, evidence, fixes, since-last-run diff) with the same `scrub()` used
  by support bundles applied to every text field — IPs, home paths, and UIDs
  are redacted before the file is written, so it is safe to post in public
  forums or issues. Exit codes match the normal report.
- **`--install-timer` / `--uninstall-timer` — one-command scheduling.**
  Writes user-level systemd units (no sudo) under `~/.config/systemd/user/`
  with resolved absolute paths (survives npm relocation), enables the timer,
  and attaches `--notify` — the machine only speaks when something NEW
  appears. Idempotent install, forgiving uninstall, honest exit 2 when
  systemd is not running. Management commands never run checks.

### Changed

- **`pkgInstall()` no longer guesses `dnf` on unknown distributions.** Void
  and Gentoo now get correct native commands (`xbps-install -Sy`, `emerge`);
  any other unrecognized distro gets an honest manual-step line instead of a
  wrong `sudo dnf install` (e.g. on NixOS).

## [0.3.5] — 2026-08-27

> **Highlights:** 6 new health checks, stronger fleet/AI privacy, safer `--fix`, and a more robust dashboard. No breaking changes.

### Security

- **Fleet reporting now blocks plaintext HTTP for authenticated pushes.** When `FLEET_API_KEY` is set, `--push` and `--alert` require `https://` (loopback `http://127.0.0.1`, `localhost`, `[::1]` exempt for local dev). The check runs at CLI validation and again before `pushReport`/`sendAlert`; a misconfigured `http://` endpoint now fails fast with exit 2 instead of leaking the Bearer token. Includes tests in `fleet.test.js` and `alert.test.js`.
- **AI summaries redact sensitive data before egress.** Finding titles and details are now scrubbed with the same `scrub()` used for support bundles — IPv4/IPv6 literals and `/home/<user>` paths never reach the LLM endpoint. Verified by `llm.test.js`.

### Added

- **6 new checks + 1 Flatpak extension (44 checks / 145 codes total):**
  - `inodes` — inode exhaustion (`df -i`): the classic “No space left on device” when `df -h` still shows free space. Tunable `inodeFullPct` / `inodeWarnPct` (90/80).
  - `orphans` — orphaned packages: `pacman -Qtdq`, `apt autoremove --dry-run`, `dnf repoquery --unneeded` / `zypper packages --unneeded`.
  - `boot` — boot partition health: space on `/boot` and `/boot/efi` plus missing `grub.cfg` / `systemd-boot` entry.
  - `cache` — user cache and trash bloat: `~/.cache` and `~/.local/share/Trash` (5/10 GB thresholds, desktop/laptop).
  - `wifi` — WiFi state: rfkill soft/hard block, `nmcli radio wifi`, adapter presence (`wifi/blocked`, `wifi/disabled`, `wifi/no-adapter`, `wifi/ok`).
  - `packages` — package-manager health: `dpkg --audit`, `apt-get check`, `dnf check`, `pacman -Dk` (`packages/broken`, `packages/locked`, `packages/ok`).
  - `flatpak/unused-runtimes` — `flatpak uninstall --unused --dry-run` for stale SDKs.
- **Documentation:** `docs/checks.md` — auto-generated catalog of all 44 checks and 145 codes (`scripts/generate-check-docs.mjs`).
- **Man page:** `packaging/linux-doctor.1` now documents every flag, including `--history-json`, `--thresholds-set`, `--alert`, `--daemon`, and `--interval`.
- **Thresholds:** `inodeFullPct` / `inodeWarnPct` documented in `docs/configuration.md` and `DEFAULT_THRESHOLDS`.

### Changed

- **Safer `--fix` catalog — no more accidental SSH drops.** `network/no-route` (interface down/up cycle) is now `manual` tier — it would have killed the SSH session running `--fix --yes`. On Debian, `security/no-firewall` now runs `sudo ufw allow OpenSSH` *before* `sudo ufw --force enable` (plus `--force` to avoid the interactive y/n hang; existing sessions survive via conntrack).
- **Threshold validation is now strict.** `loadThresholds` and both `POST /api/thresholds` handlers drop non-numeric values (`"90%"` → ignored, keeps default) instead of storing `NaN` and breaking comparisons.
- **Scrubbing now covers compressed IPv6.** `scrub()` also redacts `::1` and `fe80::` without breaking `12:34:56` timestamps (guarded by `::` / `[A-Fa-f]`). Used by both support bundles and `--ai`.

### Fixed

- **Processes: header row no longer shifts the top-3.** `ps -o rss` leaves a `RSS` header even with `args=`; the parser now filters it explicitly. `processes/ok` correctly shows the real top consumers.

## [0.3.4] — 2026-08-26

### Security

- **Desktop: harden the loopback report API against cross-origin access**: the
  shell's report server answered every request with
  `Access-Control-Allow-Origin: *`, so while the app was running any website
  open in the user's browser could read the full system report from
  `http://127.0.0.1:17321/` and POST to the config-writing endpoints
  (`/thresholds`, `/api/ignore`). It now applies the same rules as the CLI
  dashboard server (`src/web.js`): loopback `Host` headers only (anti
  DNS-rebinding), writes accepted only without an `Origin` header or from our
  own origins (`tauri://localhost`, loopback), and the CORS wildcard replaced
  by a strict origin echo — public sites can no longer read the report.
  Covered by new unit tests on the guard helpers.
- **Tauri CSP**: `tauri.conf.json` `csp: null` → strict `default-src 'self' ipc: http://ipc.localhost; script-src 'self' 'unsafe-inline'; ...` — no wildcard.

### Added

- **Release: all distros** — `release.yml` now builds `AppImage + deb + rpm + tgz` (was `appimage,deb` only) so one tag covers Debian/Ubuntu (deb), Fedora/RHEL/Bazzite (rpm), and every glibc distro (AppImage) plus `npm` (tgz).
- **Docs: dashboard screenshots** — `docs/screenshots/dashboard-light.png` + `dark.png` regenerated for the fast compact UI (`codepill` + `durpill`, `Export ▾` dropdown, `186K/191K`) via Playwright on the live `0.3.4` dashboard.
- **Expanded safe-fix catalog (22 codes)**: `containerdisk/high|warn` (prune), `security/no-firewall` (family-aware), `firmware/pending`, `locales/broken`, `disk/full`, `suspend/failed`, plus `network/no-route|dns|dns-slow`, `ssh/root-login|root-password`, `bluetooth/failed|stopped`, `ntp/pending|unsynced`, `thermal/*`, `hardware/mce|ecc`, `security/autologin`, `backup/none`. All pinned by `fix-catalog.test.js`.
- **`--history-clear`**: clear stored run history (`src/history.js` `clearHistory()`), with completions and `--help` entry.
- **Dashboard: fast compact UI for technical users** — compact density by default, `codepill` on every card (click to copy, `code:` filter in search with 60ms debounce), `durpill` per check (from `durations` now always in `/api/report`), `Export ▾` dropdown, `skel-hero` skeletons, header blur, gauge 84px, card tint. `432 tests` still pass.
- **Man page 0.3.4**: `packaging/linux-doctor.1` now documents every flag (`--fix`, `--interactive`, `--notify`, `--support`, `--no-history`, `--history-clear`, etc.).
- **CI: Rust tests**: `ci.yml` now runs `cargo test` in `src-tauri` with webkit deps.

### Changed

- **Thresholds**: `dnsSlowMs` (500ms) now configurable via `config.json` and documented in `docs/configuration.md`; `containerWarnGB/HighGB` documented.
- **Tauri Node fallback**: `src-tauri/src/lib.rs` `node_bin()` now tries `LINUX_DOCTOR_NODE`, `runtime/node|nodejs`, `node` then `nodejs` on PATH, with `which()` helper and detailed error (suggests `LINUX_DOCTOR_NODE=nodejs` on Debian).

### Fixed

- **Completions drift**: `completions/*.bash|zsh|fish` now include `--history-clear` (caught by `completions.test.js`).
- **Web test**: `web.test.js` still matches `Re-run checks` after header refresh.

## [0.3.2] — 2026-08-25

### Added

- **Desktop: complete loopback API**: the shell's report server now answers
  `/checks` (check → category map: category grouping and the checks matrix
  work in the installed app), `/history` (score trend section), and
  `GET/POST /thresholds` plus `POST /api/ignore` (thresholds panel and the
  per-finding Ignore button persist). Backed by three new hidden CLI flags
  (`--history-json`, `--thresholds-json`, `--thresholds-set`) so the Rust
  shell keeps delegating all logic to Node.

### Fixed

- **Desktop (AppImage): empty report**: the AppRun environment pointed
  `LD_LIBRARY_PATH` at the bundled libraries, which made the host's `node`
  abort with a symbol/version error — `/report` came back with an empty
  body. The shell now strips `LD_LIBRARY_PATH`/`LD_PRELOAD` from every Node
  child process.

## [0.3.3] — 2026-08-26

### Fixed

- **Desktop (AppImage): EGL launch aborts on bleeding-edge Mesa**: the shell
  now defaults to software GL (`LIBGL_ALWAYS_SOFTWARE=1`) when running from
  an AppImage, set before any GTK/WebKit initialization. The bundled
  WebKitGTK's accelerated paths could abort at window creation against very
  new host Mesa — on AMD and Intel alike, since both run on Mesa (NVIDIA's
  proprietary driver ships its own stack). A diagnostics dashboard does not
  need GPU acceleration; opt out with `LINUX_DOCTOR_HARDWARE_GL=1`. The
  `.deb` and CLI are unaffected — they use the host's matching WebKitGTK.
  This retires the manual `LIBGL_ALWAYS_SOFTWARE=1` workaround documented
  for v0.3.2.

### Changed

- **Dashboard: first-run history explainer**: with fewer than two recorded
  runs, the History section no longer vanishes silently — it shows what the
  one run on record scored and what will appear there after the next check
  (static `--html` exports keep the section hidden, as before).
- **Dashboard: motion and number polish**: JS smooth-scrolls (sidebar jump,
  checks-matrix jump, START HERE jump, history diff) now honor
  `prefers-reduced-motion`; live numbers (NEW/FIXED badges, score delta,
  trend title) use tabular figures so they stop jittering as counts change;
  the gauge ring eases between severity colors instead of snapping; the hero
  delta on a first run reads "no baseline yet" instead of "no history to
  compare".
- **Dashboard: the subtraction pass**: removed the ornamental CSS layer
  (decorative gradients, noise texture, glassmorphism, glowing gauge, stagger
  card animations, hover lift) and consolidated everything into one calm
  layer. Findings render as a single readable column with neutral info rows;
  the healthy state gets a visually lighter card with a green hairline;
  spacing follows a strict rhythm (header 40 / status 36 / toolbar 28 /
  history 56); font stacks are honest system fonts. No libraries, no new
  features; the parity vocabulary is untouched.
- **JSON schema documents the whole payload (Phase 5)**: `--schema` now
  covers every field the runtime emits — `nextAction`, `cleanStreak`,
  `scoreDelta`, `previousScore`, `lastRunAt`, top-level `unchanged`,
  `scoreBreakdown`, `durations` (`--profile`), and `system.osRelease`.
  schemaVersion stays **1**: the documented policy is that additive optional
  fields never bump the version; incompatible changes do. Consumers should
  ignore unknown properties.
- **Open-core split (Pro is no longer in this repository)**: the five premium
  checks, all key-signing crypto, and `--license-gen` have moved to the
  separate proprietary package `@linux-doctor/pro`, distributed only through
  private channels (GitHub Packages buyer tokens or signed downloads). The
  free edition now discovers an installed Pro module automatically
  (`@linux-doctor/pro`, or `LINUX_DOCTOR_PRO_MODULE=/path/index.mjs` for
  air-gapped machines) and injects its core primitives via
  `init(core) → { checks, licensing }`. Consequences:
  - Pro is genuinely unavailable for free — no public secret, no self-minted
    keys; a key string alone unlocks nothing.
  - The free repo carries zero licensing code; a new guard test
    (`tests/open-core.test.js`) fails the build if any of it ever reappears,
    and pins the loader contract with a fixture module.
  - Without the add-on, behavior is identical whether or not a key string is
    configured ("Linux Doctor Pro: not installed").

### Added

- **Output drift guard (Phase 5)**: `tests/output-drift.test.js` runs the real
  binary and asserts every emitted key — top level and in the nested
  `system` / `diffSinceLast` / finding / scoreBreakdown objects — is
  documented in `src/schema.js`. A new payload field without a schema entry
  now fails CI instead of surprising scripts and fleet consumers.
- **Golden output snapshots (Phase 5)**: the four states from the parity
  matrix (mixed / healthy-streak / info-only / first-run) are snapshotted for
  pretty, `--plain`, and `--json` in `tests/golden/snapshots/` and compared
  byte-for-byte. Regeneration is controlled (`npm run goldens:update`) so any
  wording or ordering change shows up as a reviewable diff.
- **Score breakdown everywhere (Phase 5)**: the health score's arithmetic is
  now auditable — `scoreBreakdown` travels in `--json`, the terminal report
  prints one compact line under STATUS (`SCORE 77/100 = 100 −15 disk/full …`),
  and `--plain` carries `# score-breakdown:`. The score is derived from the
  breakdown by construction (`100 − Σpenalty === score`, pinned by tests).
- **Fix catalog ↔ registry pin (Phase 5)**: every safe-fix catalog code must
  exist in the finding-code registry, and each entry must still produce a
  plan for its own finding shape — a typo'd catalog key fails at test time.
- **Output parity contract (Faza 4)**: [docs/output-parity.md](docs/output-parity.md)
  documents the one-message-four-channels rule (CLI / `--plain` / `--json` /
  dashboard) with a per-state verification matrix. The vocabulary is pinned
  by tests that grep both the CLI output and the dashboard HTML; a new test
  guarantees `nextAction` in `--json` always matches the report's ▶ START
  HERE line.
- **`nextAction` in the JSON payload**: the ▶ START HERE pick now travels as
  data (`{code, severity, title, fix}`), and the dashboard renders it
  directly instead of recomputing — banner and report can never disagree
  (older payloads keep the client-side fallback).
- **"Failed checks" in the dashboard**: checks that threw are now visible in
  the GUI with the same wording as the CLI, so a partially-broken run is
  never silently rendered as a clean one.
- **Ignore management from the CLI (Faza 3)**: `--ignore-add <value>` /
  `--ignore-remove <value>` write the same config keys as the dashboard's
  Ignore button. Code-shaped values (`check/reason`) land in the
  exact-match code list; anything else is a title fragment. Both commands
  print the resulting list using the same format as `--ignore-list` (one
  vocabulary everywhere).
- **Healthy-state streak**: when a machine is clean, the report says so with
  momentum — "✅ Everything is clean — N clean run(s) in a row" — computed
  from history and exposed to the dashboard via `cleanStreak` in the JSON
  payload. Info-only systems read "No high or medium issues — N
  informational notes below" instead of pretending there is nothing.
- **Support bundle hardening**: `diffSinceLast` titles now go through the
  same redaction (IPs, home paths) as finding text.

### Changed

- **History v2 (Faza 2 — history as the core)**:
  - The file wrapper now carries `version: 2` (v1 files still read fine).
    Every saved finding is guaranteed to have its stable `code`; diffing
    among coded entries is code-only, so rewritten titles can no longer
    churn NEW/FIXED markers.
  - **Repair-on-read**: a partially corrupted history keeps its well-formed
    runs and drops only the broken entries (and broken finding rows inside
    them); a truncated file degrades to "no history" instead of failing.
  - **Upgrade bridge**: v1 entries stored without codes are matched by
    title for their remaining lifetime in the window, so upgrading never
    reads as everything-new-plus-everything-fixed at once. Reworded issues
    surface exactly once during the transition, then identity is permanent.
  - New `tests/output-parity.test.js` pins the one-computation contract:
    CLI text, `--plain` and `--json` (and therefore the dashboard) must
    render identical new/fixed/unchanged numbers from the same diff object,
    and the score stays severity-driven regardless of history content.
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

### Fixed

- **TREND no longer lags a run behind**: the sparkline now ends at the
  current run's score (previously it showed only stored runs, so a fresh
  recovery read as a continuing decline). The window still caps at 20
  points, current run included. Pinned by `output-parity.test.js`.
- **Score delta is visible in the terminal report**: the pretty STATUS line
  now carries the same "(+N)" convention as `--plain`
  (`health 76/100 (+9)`), so recovery reads identically in every channel.
- **Dashboard Auto-refresh paused state is visible**: the button previously
  kept its active styling while paused; it now renders amber/dimmed.

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
