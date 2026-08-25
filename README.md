# 🩺 Linux Doctor

[![Sponsor](https://img.shields.io/github/sponsors/zShaD0w7x)](https://github.com/sponsors/zShaD0w7x)

**Linux diagnostics that explain the problem — and remember what changed.**

Linux Doctor runs safe, read-only checks and surfaces only the issues that
actually matter. Each finding comes with a clear explanation and a
copy-paste fix. It remembers your last run, so every report tells you what's
new, what got fixed, and what stayed the same.

It never changes your system. Fixes are suggestions you run yourself.

<p align="center">
  <img src="https://raw.githubusercontent.com/zShaD0w7x/linux-doctor/main/docs/screenshots/dashboard-light.png" alt="Linux Doctor dashboard (light): health score, START HERE action, findings grouped by severity" width="49%"><img src="https://raw.githubusercontent.com/zShaD0w7x/linux-doctor/main/docs/screenshots/dashboard-dark.png" alt="Linux Doctor dashboard (dark): health score, START HERE action, findings grouped by severity" width="49%">
</p>

## Download the app (recommended)

Desktop app — no install, no package manager:

- **[Latest release](https://github.com/zShaD0w7x/linux-doctor/releases/latest)** — grab `Linux.Doctor_<version>_amd64.AppImage`

```bash
chmod +x Linux.Doctor_*_amd64.AppImage
./Linux.Doctor_*_amd64.AppImage
```

Also attached to each release: `.deb` (Debian/Ubuntu) and the CLI tarball.
AppImage runs on most distributions (glibc-based); on immutable systems
(Fedora Silverblue, Bazzite) it works out of the box. The only runtime
requirement: **Node.js ≥ 20 installed** (`node --version`) — the app runs
the checks through it; everything else is bundled.

**Troubleshooting the AppImage on very new Mesa (Fedora/Bazzite, AMD):**
the bundle's WebKitGTK comes from an older LTS base and its accelerated
paths can abort against bleeding-edge Mesa (`Could not create default EGL
display`). Verified workaround — force software rendering (a diagnostics
dashboard does not need GPU anyway):

```bash
LIBGL_ALWAYS_SOFTWARE=1 ./Linux.Doctor_*_amd64.AppImage
```

Compositing/dmabuf env flags alone are not sufficient on these hosts
(tested on Bazzite 44). Long-term fix tracked: build desktop
bundles on a newer LTS base so bundled WebKitGTK matches modern Mesa.

> The desktop app shells out to Node.js ≥ 20 for the checks themselves
> (bundled-runtime builds are planned). Everything else — window, dashboard,
> history — needs nothing.

## Install & first run (CLI)

Needs Node.js ≥ 20.

```bash
npx github:zShaD0w7x/linux-doctor     # no install, straight from GitHub
# or:
npm install -g linux-doctor && linux-doctor
```

Prefer a native CLI package? **Arch / AUR:** `linux-doctor` —
[PKGBUILD](packaging/PKGBUILD) · **Fedora / RHEL / openSUSE:** build an RPM
with the [linux-doctor.spec](packaging/linux-doctor.spec). Details:
[packaging/README.md](packaging/README.md).

```
STATUS   0 high, 2 medium, 19 info · health 74/100
TREND    ▄▅▅▆▆▇  last 6 run(s) · 61 → 74 ▲

▶ START HERE   #1 System is low on usable memory
               Close apps you are not using, then re-run this check.

Your system is low on usable memory: 9.4 GB of 15 GB is in use and 2.2 GB is
being pushed to swap. This is the most common cause of a sluggish desktop.
How to fix: close unused browser tabs, then re-run this check.

Since last run: 2 new · 1 fixed · 19 unchanged
```

The report leads with a **▶ START HERE** line (the single most useful
action) and a **TREND** sparkline, and every run is diffed against the
previous one. Read-only by default: `--fix` prints a dry-run plan of
commands sourced only from a small built-in safe-fix catalog — running it
needs a second opt-in (`--fix --yes`), and `[manual]` items always stay
yours to run.

## What it checks

Every finding carries a stable identity: a `code` (`check/reason`), a
severity decided against the [severity rubric](docs/severity.md), human
detail, evidence from the system, and a suggested fix. Codes are the join
key for history diffing (NEW/FIXED) and for `--ignore-code`, so they never
change silently.

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

Checks that don't apply to your machine — `battery` on a desktop, `reboot`
on immutable systems — are skipped automatically and reported honestly in a
**Skipped** section instead of producing misleading findings.

## Health score & history

Every run is saved to `~/.local/share/linux-doctor/history.json` (override
with `LINUX_DOCTOR_HISTORY`). From that history you get a **health score
(0–100)** with an auditable breakdown (`100 − Σpenalties`), a **TREND**
sparkline of your last runs, and a plain-language **diff per run** — new,
fixed, unchanged. Findings that share a root cause are collapsed before
scoring, so one problem never counts twice. History is a bonus, never a
dependency: `--no-history` disables it, and if it cannot be written the
report still works.

## Documentation

| Doc | Contents |
|---|---|
| [docs/cli.md](docs/cli.md) | every flag, `--fix`, `--interactive`, `--notify`, `--plain`, exit codes, shell completions, systemd timer |
| [docs/dashboard.md](docs/dashboard.md) | the `--web` dashboard and the desktop app, in detail |
| [docs/configuration.md](docs/configuration.md) | ignore list, thresholds, plugins, caching, immutable-distro behavior |
| [docs/integrations.md](docs/integrations.md) | JSON schema v1, `--support` bundles, optional AI summary, fleet reporting |
| [docs/severity.md](docs/severity.md) | how severities are decided |
| [CHANGELOG.md](CHANGELOG.md) | every release, Keep-a-Changelog style |

## Roadmap

- ~~GUI with a one-click report~~ — shipped: a Tauri desktop app
- ~~Report history and change detection~~ — shipped: health score, NEW/FIXED diff
- ~~More checks: Bluetooth, Wayland, backup, hardware errors, LUKS~~ — shipped
- Auto-generated, distro-specific fix instructions
- Signed store installers and a `.desktop` launcher for the GUI

<a id="tiers"></a>
## Editions

This repository **is** the Free edition — the whole product for everyday
users, GPL-3.0-or-later, forever. Optional paid tiers for power users and
companies are strictly additive and described in
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

## License

**Dual-licensed.**

- [GPL-3.0-or-later](LICENSE) — free for individuals and open-source projects: you may redistribute it and/or modify it, but any derivative work must stay open-source under the same terms.
- [Commercial license](COMMERCIAL-LICENSE.md) — for companies that need to use Linux Doctor inside proprietary products.

By contributing, you agree your contributions are offered under both licenses (see [CONTRIBUTING.md](CONTRIBUTING.md)).
