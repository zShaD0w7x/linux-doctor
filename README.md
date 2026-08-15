# 🩺 Linux Doctor

[![Sponsor](https://img.shields.io/github/sponsors/zShaD0w7x)](https://github.com/sponsors/zShaD0w7x)

**Plain-English health checks for your Linux system.**

Linux Doctor runs a battery of read-only checks (memory, CPU, disk, services, logs, suspend/resume, security, updates, processes, battery), finds the problems that actually matter, explains them in clear **American English**, and tells you exactly how to fix them.

No more copy-pasting scary `journalctl` output into a forum. Instead:

```
Your system is low on usable memory: 9.4 GB of 15 GB is in use and 2.2 GB is
being pushed to swap. This is the most common cause of a sluggish desktop.
How to fix: close unused browser tabs, then re-run this check.
```

## Screenshots

![Linux Doctor dashboard](docs/screenshots/dashboard.png)

The `--web` dashboard: a green/red status banner, severity chips, one card per finding with collapsible **Evidence** blocks, and a **Copy** button next to every fix.

## Why it exists

Linux diagnostics are cryptic. `journalctl` speaks in hieroglyphics, and most users end up running commands a stranger on Reddit told them to run. Linux Doctor is the difference between *"SELinux denied access on /proc/swaps"* and *"your system is slow because Brave is using 41% of your CPU."*

## Safety

- **Read-only, always.** Linux Doctor inspects the system but never modifies anything. Fixes are shown as suggestions — it never runs them for you.
- No dependencies. Node.js ≥ 20 is all you need.

## Install & run

```bash
node bin/doctor.js            # run from this directory
# or, from anywhere:
npm install -g . && linux-doctor
```

## Options

```
--check <id>   run a single check (e.g. --check memory)
--json         machine-readable JSON output (great for scripting)
--web          open the visual dashboard in your browser (recommended)
--ai           add an AI summary in plain English (needs LLM_API_KEY)
--push <url>   post the report to a fleet server (FLEET_API_KEY optional)
--help         usage
--version      version
```

## Visual dashboard

```bash
linux-doctor --web
```

Opens a dark, card-based dashboard in your browser at `127.0.0.1`: a green/red status banner, severity chips, one card per finding with a collapsible **Evidence** block, and a **Copy** button next to every fix. Hit **Re-run checks** to get a fresh report. Pure HTML/CSS/JS — no frameworks, no build step.

Exit code: `0` if nothing serious was found, `1` if there are high/medium findings, `2` on errors — so you can use it in scripts and cron jobs.

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

## Checks

| ID | What it checks |
|---|---|
| `memory` | RAM pressure, swap usage |
| `load` | CPU load vs core count |
| `disk` | Real partitions near full (ignores virtual/immutable roots) |
| `services` | Failed systemd services (system + user) |
| `journal` | Error log, with known-benign noise filtered out |
| `suspend` | Failed suspend/resume hooks (laptops) |
| `security` | Firewall, SELinux, update services |
| `updates` | Pending package updates (dnf/apt/pacman) |
| `processes` | Top memory consumers, with friendly names |
| `battery` | Laptop battery level (skipped on desktops) |
| `gpu` | Graphics driver health (NVIDIA proprietary vs nouveau vs missing, software rendering) |

## AI summary (optional)

```bash
LLM_API_KEY=sk-... linux-doctor --ai
```

Works with any OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_MODEL`). If the AI is unreachable, Linux Doctor silently falls back to the plain report — the AI is a bonus, never a dependency.

## Fleet reporting (enterprise)

```bash
linux-doctor --push https://your-server/reports
```

Sends the report as JSON to a central endpoint, tagged with the machine's hostname, so a company can collect health data from every machine in one place. Optional auth via `FLEET_API_KEY` (sent as a `Bearer` token). Pairs well with cron:

```bash
0 9 * * * linux-doctor --push https://your-server/reports --check memory
```

The client is free and open-source. The hosted fleet dashboard — one place to see every machine's issues, with alerting — is the paid enterprise service. The open-source [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) explains the licensing options for companies that want to embed Linux Doctor in their own products.

## Roadmap

- ~~GUI with a one-click report~~ — shipped: a Tauri desktop app (see above). Next: a `.desktop` launcher and signed store installers
- More checks: Bluetooth, firmware (fwupd), Wayland issues
- Report history and change detection ("new since last check")
- Auto-generated, distro-specific fix instructions

## License

**Dual-licensed.**

- [GPL-3.0-or-later](LICENSE) — free for individuals and open-source projects: you may redistribute it and/or modify it, but any derivative work must stay open-source under the same terms.
- [Commercial license](COMMERCIAL-LICENSE.md) — for companies that need to use Linux Doctor inside proprietary products.

By contributing, you agree your contributions are offered under both licenses (see [CONTRIBUTING.md](CONTRIBUTING.md)).
