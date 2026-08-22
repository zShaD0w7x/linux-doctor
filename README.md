# 🩺 Linux Doctor

[![Sponsor](https://img.shields.io/github/sponsors/zShaD0w7x)](https://github.com/sponsors/zShaD0w7x)

**Linux diagnostics that explain the problem — and remember what changed.**

Linux Doctor runs safe, read-only checks and surfaces only the issues that
actually matter. Each finding comes with a plain-English explanation and a
copy-paste fix. It remembers your last run, so every report tells you what's
new, what got fixed, and what stayed the same.

It never changes your system. Fixes are suggestions you run yourself.

## Install & first run

```bash
node bin/doctor.js            # run from this directory
# or, from anywhere:
npm install -g . && linux-doctor
```

No clone needed? Try it straight from GitHub (needs Node.js ≥ 20):

```bash
npx github:zShaD0w7x/linux-doctor
```

```
Your system is low on usable memory: 9.4 GB of 15 GB is in use and 2.2 GB is
being pushed to swap. This is the most common cause of a sluggish desktop.
How to fix: close unused browser tabs, then re-run this check.

Since last run: 2 new · 1 fixed · 19 unchanged
```

The report also leads with a **▶ START HERE** line (the single most useful
action) and a **TREND** sparkline of your last runs:

```
STATUS   0 high, 2 medium, 19 info · health 74/100
TREND    ▄▅▅▆▆▇  last 6 run(s) · 61 → 74 ▲

▶ START HERE   #1 System is low on usable memory
               Close apps you are not using, then re-run this check.
```

Native packages (no Node needed on PATH):

- **Arch / AUR:** `linux-doctor` — [PKGBUILD](packaging/PKGBUILD)
- **Fedora / RHEL / openSUSE:** build an RPM with the [linux-doctor.spec](packaging/linux-doctor.spec)

See [packaging/README.md](packaging/README.md) for details.

Shell completions (bash/zsh/fish) are in [completions/](completions/). Install them with:

```bash
# bash
install -Dm644 completions/linux-doctor.bash /usr/share/bash-completion/completions/linux-doctor
# zsh
install -Dm644 completions/linux-doctor.zsh /usr/share/zsh/site-functions/_linux-doctor
# fish
install -Dm644 completions/linux-doctor.fish ~/.config/fish/completions/linux-doctor.fish
```

To run checks automatically, enable the systemd timer:

```bash
sudo cp packaging/linux-doctor.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now linux-doctor.timer
```

## Options

```
--check <id>      run only the given check(s) — comma-separated or repeated
--list            list the checks by category without running them
--check-list      list checks as JSON (id, title, category, appliesTo)
--json            machine-readable JSON output (great for scripting)
--plain           plain, tab-separated text — no colors/emoji, grep-friendly
--summary         one-liner: score + severity counts + delta (for cron/scripts)
--no-history      disable history recording for this run (or set LINUX_DOCTOR_NO_HISTORY)
--todo            numbered, copy-pasteable list of what to run, in order
--fix             dry run: show the safe-fix commands for the findings found
--fix --yes       execute the [apply] safe-fix commands ([manual] never runs)
--interactive     browse findings in an interactive terminal UI (needs a TTY)
--notify          desktop notification (notify-send) when new issues appear
--self-test       explain the environment: distro, profile, which checks run
--web             open the visual dashboard in your browser (recommended)
--ai              add an AI summary in plain English (needs LLM_API_KEY)
--html <path>     save a standalone HTML report (open in any browser)
--compare <file>  diff a previous JSON report against the current run
--push <url>      post the report to a fleet server (FLEET_API_KEY optional)
--severity <s>    show only findings at this severity (high, medium, info)
--ignore <txt>    hide findings whose title contains <txt>
--ignore-code <c> hide findings by stable code (e.g. services/failed)
--ignore-list     show configured ignore patterns and exit
--init-config     create a starter config file with commented thresholds
--schema          print the JSON Schema for --json output (v1)
--support         write a privacy-scrubbed support bundle for bug reports
--profile         append per-check durations to the report
--license         show Pro license status and exit
--license-gen <s> issue a new Pro license key for a subscriber [maintainer]
--alert <url>     POST a webhook when the machine degrades [Pro]
--daemon          run continuously, re-checking every --interval [Pro]
--interval <s>    seconds between --daemon runs (default 3600) [Pro]
--help            usage
--version      version
```

## Fixing issues safely (`--fix`)

Linux Doctor is read-only by default. `--fix` stays that way: it prints a
**dry-run plan** of concrete commands for the findings on *your* system:

```bash
$ linux-doctor --fix
# linux-doctor --fix (dry run — nothing was executed)
1. [apply] (services/failed) systemctl --user reset-failed 'app-picom@autostart.service'
2. [apply] (timers/broken) sudo systemctl start 'dnf-makecache.timer'
```

Commands come **only** from a small built-in safe-fix catalog (`src/fix.js`)
mapped to stable finding codes — the free-text suggestions in the report are
never executed. Review the plan, then opt in a second time to run it:

```bash
linux-doctor --fix --yes     # runs only [apply]; [manual] items are printed, never executed
```

`[manual]` entries (a pending reboot, firmware updates) are always left for
you to run yourself.

## Interactive mode (`--interactive`)

```bash
linux-doctor --interactive
```

A zero-dependency terminal UI over the report: `↑`/`↓` or `j`/`k` pick a
finding, `Enter` opens its details and evidence, `c` copies the suggested fix,
and `f` copies the safe-fix command when one exists in the catalog. `q` quits.
Without a TTY (pipes, CI) it falls back to printing the normal report.

## Desktop notifications (`--notify`)

```bash
linux-doctor --notify          # also works with --daemon
```

Sends a native desktop notification via `notify-send` when **new** medium/high
findings appear — so a scheduled agent can tell you about degradation without
a terminal. Needs a graphical session; silently does nothing otherwise.

## Visual dashboard

```bash
linux-doctor --web
```

Opens a dashboard in your browser at `127.0.0.1:43901` (a stable, predictable URL — a second instance falls back to a free port instead of crashing). The layout is organized into four clear zones: **identity** (logo + system info + actions), **status** (health gauge with score/delta, a plain-language message, and NEW/FIXED chips), **control** (severity filters with live counts, search, Expand/Collapse all, and a Clear button), and **content** (High → Medium → Informational → Fixed → Skipped → history trend, in that fixed order). **High** findings are open by default; **Medium**, **Informational**, **Fixed**, and **Skipped** collapse, so a full report fits on one screen without scrolling. Click any finding to expand its explanation, **Evidence**, and a **Copy** button next to the fix. Hit **Re-run checks** for a fresh report. The dashboard **auto-refreshes** every 20s — it pauses while you are reading (searching, filtering, or with a finding expanded) so your place is never reset. Pure HTML/CSS/JS — no frameworks, no build step.

The **history** view draws your health-score sparkline (with date tooltips and a dashed 50-point "needs attention" line) plus a new stacked bar chart of high/medium/info findings across recent runs, so you can see at a glance whether problems are trending up or down. The **Skipped** section now also lists checks skipped because they do not apply to an immutable/atomic system (e.g. `reboot`).

**Dark/light theme:** the dashboard follows your system theme and remembers your choice — the 🌓 button in the header cycles light → dark → auto. **Keyboard navigation:** `↑`/`↓` move between findings, `Enter` opens/closes the focused one. The palette is color-blind friendly: every severity has an icon (🔴 🟡 🔵) plus a text label, never color alone. While checks re-run, a spinner shows progress and the button is disabled.

Exit code: `0` if nothing serious was found, `1` if there are high/medium findings, `2` on errors — so you can use it in scripts and cron jobs.

## Plain output (`--plain`)

```bash
linux-doctor --plain
```

Prints the same report as plain, tab-separated lines — no colors, emoji, or box drawing — so it works in dumb terminals and pipes cleanly into `grep`/`awk`. Metadata goes to `#` comment lines; each finding is one `severity<TAB>number<TAB>title` row with `detail`/`fix` rows right after:

```
# linux-doctor
# system: Bazzite 44 · kernel 6.1.0 · 16 core(s) · up 2h
# score: 53/100
# summary: 1 high, 4 medium, 12 info
high    1   3 services failed to start
fix     1   Inspect one with `systemctl status ...`
```

Exit codes are the same as the normal report, so `--plain` works in cron and scripts too.

## Desktop app (GUI)

The same dashboard, as a native desktop window — launch it, and one click on **Re-run checks** gives you a fresh report. Built with Tauri v2: the window is a thin Rust shell that runs the exact same Node checks (`bin/doctor.js --json`), so there is **zero duplication** between the CLI and the GUI — the checks are the single source of truth.

**Prerequisites:** Node.js ≥ 20 (the checks run through Node), Rust, and the Tauri system libraries:

```bash
# Fedora / Bazzite (immutable) — layering applies live, no reboot needed
sudo rpm-ostree install --apply-live webkit2gtk4.1-devel dbus-devel librsvg2-devel libxdo-devel
# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libxdo-dev librsvg2-dev
```

**Run in development:**

```bash
npm install
npm run gui:dev
```

**Build installers (.deb / .rpm / AppImage):**

```bash
npm run gui:build
```

The bundled app needs `node` on PATH to run the checks. Set `LINUX_DOCTOR_ROOT` to point at a Linux Doctor checkout if the bundled resources are unavailable.

To put the app in your desktop menu, install the launcher (the deb/rpm bundles ship one automatically; this is for the AppImage or manual setups):

```bash
install -Dm644 packaging/linux-doctor.desktop ~/.local/share/applications/
install -Dm644 src-tauri/icons/128x128.png ~/.local/share/icons/hicolor/128x128/apps/linux-doctor.png
```

## Checks

| ID | What it checks |
|---|---|
| `memory` | RAM pressure, swap usage |
| `load` | CPU load vs core count |
| `disk` | Real partitions near full (ignores virtual/immutable roots) |
| `zram` | Swap/zram health — compressed swap near full, swappiness |
| `locales` | System locale — missing/broken locale generation |
| `services` | Failed systemd services (system + user) |
| `timers` | Scheduled tasks — enabled systemd timers that never run |
| `journal` | Error log, with known-benign noise filtered out |
| `journald` | System journal (log) disk usage |
| `suspend` | Failed suspend/resume hooks (laptops) |
| `containers` | Container runtimes — podman/docker installed and usable |
| `containerdisk` | Container image storage (podman/docker) — hidden disk usage |
| `crash` | Crash and reboot history (coredumps + unexpected restarts, correlated with automatic-update mechanisms) |
| `security` | Firewall, SELinux, update services |
| `ssh` | SSH server posture — root login, password authentication |
| `autologin` | Automatic login enabled in the display manager |
| `secureboot` | UEFI boot mode, Secure Boot state, TPM presence |
| `network` | Default route and DNS resolution |
| `ntp` | Clock synchronization (time sync daemon state) |
| `updates` | Pending package updates (dnf/apt/pacman) |
| `snap` | Pending snap refreshes and the snapd auto-refresh timer |
| `firmware` | Pending firmware (BIOS/UEFI) updates via fwupd |
| `flatpak` | Pending Flatpak app updates |
| `reboot` | Newer kernel installed but not booted, pending restart |
| `processes` | Top memory consumers, with friendly names |
| `thermal` | CPU temperatures and thermal-throttling events |
| `battery` | Laptop battery level and capacity wear (skipped on desktops) |
| `gpu` | Graphics driver health (NVIDIA proprietary vs nouveau vs missing, software rendering) |
| `bluetooth` | Bluetooth controller presence and daemon state |
| `wayland` | Display session type, running compositor, software rendering |
| `audio` | Sound server (PipeWire/PulseAudio) and output device (desktop/laptop) |
| `backup` | Backup/snapshot tools installed and scheduled (borg, restic, snapper, timeshift…) |
| `fstrim` | SSD TRIM — weekly fstrim.timer enabled or continuous discard mounting |
| `hardware` | Machine check exceptions and corrected ECC memory errors |
| `smart` | Disk SMART health (needs root or smartmontools) |
| `luks` | Full-disk encryption (LUKS) presence |

`--list` groups checks by category and marks the ones that do not apply to the
current machine (e.g. `battery` on a desktop) with `(n/a on desktop)` — checks
that only apply to some machine kinds are skipped automatically on a full run,
unless you pick them explicitly with `--check`.

## Caching

The `updates` check refreshes package metadata, which is the slowest thing in a full run (~5s with dnf). Its result is cached for 30 minutes at `~/.cache/linux-doctor/updates.json` (override with `LINUX_DOCTOR_CACHE`; disable with `LINUX_DOCTOR_UPDATES_TTL_MS=0`). A failed check is never cached, so the next run retries. The cache is a bonus, never a dependency — if it cannot be written, the check just runs uncached.

## Health score & history

Every run is saved to `~/.local/share/linux-doctor/history.json` (override with `LINUX_DOCTOR_HISTORY`). From that history Linux Doctor shows:

- **Health score (0–100)**: 100, minus 15 per high-severity and 8 per medium-severity finding — with escalation inside a tier so problems compound honestly: each additional high beyond the first costs +5 more (15, 20, 25, 30 …), and mediums past the third cost +1 more. Four failed units must not land anywhere near a pile of annoyances. Findings that report the same root cause (e.g. software rendering, detected by both the `gpu` and `wayland` checks) are collapsed into one before scoring, so one problem never counts twice.
- **"New since last check"**: findings whose title did not appear in the previous run get a `(new)` marker in the terminal report, a purple **NEW** badge in the dashboard, and are counted in a `new` chip.
- **"Since last run" change message**: each run is diffed against the previous one and reports how many findings are **new**, **fixed**, and **unchanged** — so a run with no change reads "no change since last check" rather than alarming you. The terminal report prints a plain-language line; `--summary` and `--json` carry the same `newCount`/`fixedCount`/`unchanged`/`changeMessage`.
- **Health score trend**: the terminal report shows a `TREND` sparkline (`▄▅▆▇`) of your last runs (capped to the 20 most recent), so improvement is visible at a glance.
- **Disable history**: pass `--no-history` (or set `LINUX_DOCTOR_NO_HISTORY`) for a one-off run that does not record history — useful inside other scripts where you want the report but not a stored run.

The score and new-count travel with `--json` output and `--push` fleet reports, so a fleet dashboard can show trends over time. The web dashboard draws your health-score sparkline and a severity bar chart from this history. History is a bonus, never a dependency — if it cannot be written, the report still works.

## Support bundle (`--support`)

```bash
linux-doctor --support
# → writes linux-doctor-support-<timestamp>.json
```

Produces a single, shareable file for bug reports: system facts (`system.atomic` included), the active config, the latest findings, and a capped copy of your history (last 10 runs). It is **privacy-scrubbed** — IP addresses and `/home/<user>` paths are redacted before anything is written, and the bundle lists exactly what it excluded under `privacy.excluded`, so you can attach it to an issue without leaking your network or home directory. It contains no secrets (no API keys, no file contents).

## Immutable / atomic distros

Linux Doctor detects image-based systems and reports them in `system.atomic` (`immutable`, `imageBased`, `bootc`, `variant`, `pkg`). Some checks do not make sense on an immutable OS — most importantly `reboot`, which you cannot act on without an OS update rather than a local reboot. Such checks are skipped and listed in `skippedChecks` (with their reason) and `checksAtomicSkipped` in JSON, and surfaced in the dashboard's **Skipped** section, instead of producing misleading findings. Checks that are still valid on atomic systems (e.g. `security` — firewall/SELinux) run normally.

## Ignore list

Tired of the same finding every run? Hide it — per run with `--ignore`, or permanently in the config file (`~/.config/linux-doctor/config.json`, override with `LINUX_DOCTOR_CONFIG`):

```bash
linux-doctor --ignore "Suspend hooks are failing"
# permanent:
cat > ~/.config/linux-doctor/config.json <<'EOF'
{ "ignore": ["Suspend hooks are failing", "fw-fanctrl"] }
EOF
```

Matches are case-insensitive substrings of the finding title, so a short fragment like `fw-fanctrl` works. Ignored findings are dropped from the report, the score, and the history — they simply stop existing. The dashboard has an **Ignore** button on every finding that saves the pattern for you. To un-ignore, edit the config file. The config is a bonus, never a dependency — if it cannot be read, nothing is ignored.

Ignore is never silent: hidden findings are counted (`# ignored: N` in `--plain`, `ignoredCount` in `--json`, "N finding(s) hidden" in the terminal report), and a pattern that matches nothing warns on stderr — so a stale ignore (e.g. after a finding title changed) rots loudly, not silently.

## Tuning thresholds

Every severity threshold has a sane desktop default, but they are all tunable in the same config file:

```jsonc
{
  "ignore": ["fw-fanctrl"],
  "thresholds": {
    "diskFullPct": 90,      // partition % full → high
    "diskWarnPct": 80,      // partition % full → medium
    "memLowRatio": 0.15,    // available/total below → high
    "memWarnRatio": 0.25,   // available/total below → medium
    "loadWarnRatio": 0.7,   // load per core above → info
    "loadHighRatio": 1.0,   // load per core above → medium
    "loadCriticalRatio": 1.5, // load per core above → high
    "tempWarnC": 85,        // hottest CPU zone → medium
    "tempHotC": 95,         // hottest CPU zone → high
    "procWarnRatio": 0.2,   // single app share of RAM above → medium
    "procHighRatio": 0.4,   // single app share of RAM above → high
    "journalWarnBytes": 2147483648 // journal size above → medium (2 GB)
  }
}
```

Every key is optional; unset keys keep the defaults. A server on a small disk might set `diskFullPct: 80`, a 4 GB laptop `memWarnRatio: 0.3`.

## Plugins (custom checks)

Drop any `.js` file into `~/.config/linux-doctor/checks/` (override with `LINUX_DOCTOR_PLUGINS`) and it becomes a check — no forking, no registry edits. A plugin file exports an object shaped like a built-in check:

```js
// ~/.config/linux-doctor/checks/example.js
export default {
  id: "example",
  title: "Example custom check",
  category: "custom",          // optional
  appliesTo: ["server"],       // optional: desktop | laptop | server
  async run(ctx) {
    const res = await ctx.run("some-read-only-command 2>/dev/null");
    if (!res.ok) return [];
    return [{ severity: "info", title: "Everything is fine", detail: null, evidence: res.stdout, fix: null, confidence: "high" }];
  },
};
```

Plugins show up in `--list`, are gated by `appliesTo` like built-ins, and are runnable with `--check example`. A broken or id-colliding plugin is skipped with a warning — it never takes down a run.

## JSON output (v1 schema)

`--json` prints a versioned payload so scripts can rely on its shape:

- `schemaVersion`, `tool`, `version` — what produced this and which schema it follows
- `generatedAt`, `durationMs` — when the checks ran and how long they took
- `system`, `counts`, `score`, `newCount`, `ignoredCount`, `checkErrors` (checks that threw — the run always survives a broken check, it is listed here instead), `checksRun`/`checksSkipped` (what actually ran — "no findings" means no problems, not nothing ran)
- `findings[]` — every finding carries `check` (which check produced it) and a stable `code` (e.g. `suspend/system-sleep-hooks`) for scripting and ignore rules; `dedupeKey` marks findings that share a root cause with another check

```bash
linux-doctor --json | jq '.findings[] | select(.severity == "high") | {code, title, fix}'
```

If the shape ever changes incompatibly, `schemaVersion` is bumped — code that checks it never breaks silently.

## AI summary (optional)

```bash
LLM_API_KEY=sk-... linux-doctor --ai
```

Works with any OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_MODEL`). If the AI is unreachable, Linux Doctor silently falls back to the plain report — the AI is a bonus, never a dependency.

## Fleet reporting (enterprise)

```bash
linux-doctor --push https://your-server/reports
```

Sends the report as JSON to a central endpoint, so a company can collect health data from every machine in one place. The payload carries the machine's hostname plus a **stable `machineId`** (from `/etc/machine-id`), so a fleet dashboard can recognize a machine across reinstalls of the agent. When the client has history, the payload also includes `diffSinceLast` (`added`/`fixed`) — the fleet server gets change detection without recomputing it. Optional auth via `FLEET_API_KEY` (sent as a `Bearer` token). Pairs well with cron:

```bash
0 9 * * * linux-doctor --push https://your-server/reports
```

The client is free and open-source. The hosted fleet dashboard — one place to see every machine's issues, with alerting — is the paid enterprise service. The open-source [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) explains the licensing options for companies that want to embed Linux Doctor in their own products.

## Pro features (license key)

Most of Linux Doctor is free and always will be. A small **Pro** tier — deep-diagnostic checks, alerting, and a scheduled agent — unlocks behind a license key so the maintainer can offer them as a paid subscription without touching the free edition.

```bash
# show the current license status
linux-doctor --license
```

The key lives in `LINUX_DOCTOR_LICENSE` (env) or `licenseKey` in the config file (`--init-config` creates the field). The free edition never lists, runs, or even knows about Pro checks, and Pro-only flags are rejected outright:

```bash
linux-doctor --check hardening   # → "Unknown check" without a key
linux-doctor --daemon            # → rejected without a key
```

What Pro adds:

- **Deep-diagnostic checks** — `hardening` (sysctl hardening posture), `scrub` (ZFS/Btrfs scrub staleness), `boottime` (slow-boot triage via `systemd-analyze`), `connets` (container bridge/link health), `journalcap` (journal size cap vs. disk-usage). They run alongside the free checks and appear in the same report, scoring and JSON.
- **Alerting** — `--alert <url>` POSTs a webhook only when the machine actually degrades (any high-severity finding, or a new medium/high since the last run), so alert fatigue stays low. Usable in cron.
- **Scheduled agent** — `--daemon --interval <s>` re-checks forever, pushing to the fleet server and/or alerting the webhook each cycle. Run it under systemd (see `packaging/README.md`) for scheduled reporting.
- **Advanced AI summaries** — `--ai` with a Pro key returns an action plan (prioritized fixes + concrete commands from the findings' fix fields) instead of a plain summary.

Keys are HMAC-signed (`ldpro.v1.…`), issued by the maintainer with `linux-doctor --license-gen <sub>`. The signing secret ships with the code by design — Linux Doctor is GPL, and the key merely gates features, not the code.

## Roadmap

- ~~GUI with a one-click report~~ — shipped: a Tauri desktop app (see above). Next: a `.desktop` launcher and signed store installers
- ~~Report history and change detection~~ — shipped: health score, "new since last check", history at `~/.local/share/linux-doctor/history.json`
- ~~More checks: Bluetooth, Wayland issues, backup/snapshot presence~~ — shipped: `bluetooth`, `wayland`, `backup`
- ~~More checks: hardware errors (EDC/MCE), full disk-encryption (LUKS)~~ — shipped: `hardware`, `luks`
- Auto-generated, distro-specific fix instructions
- Signed store installers and a `.desktop` launcher for the GUI

## License

**Dual-licensed.**

- [GPL-3.0-or-later](LICENSE) — free for individuals and open-source projects: you may redistribute it and/or modify it, but any derivative work must stay open-source under the same terms.
- [Commercial license](COMMERCIAL-LICENSE.md) — for companies that need to use Linux Doctor inside proprietary products.

By contributing, you agree your contributions are offered under both licenses (see [CONTRIBUTING.md](CONTRIBUTING.md)).
