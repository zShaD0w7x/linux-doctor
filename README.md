# 🩺 Linux Doctor

**Plain-English health checks for your Linux system.**

Linux Doctor runs a battery of read-only checks (memory, CPU, disk, services, logs, suspend/resume, security, updates, processes, battery), finds the problems that actually matter, explains them in clear **American English**, and tells you exactly how to fix them.

No more copy-pasting scary `journalctl` output into a forum. Instead:

```
Your system is low on usable memory: 9.4 GB of 15 GB is in use and 2.2 GB is
being pushed to swap. This is the most common cause of a sluggish desktop.
How to fix: close unused browser tabs, then re-run this check.
```

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
--help         usage
--version      version
```

## Visual dashboard

```bash
linux-doctor --web
```

Opens a dark, card-based dashboard in your browser at `127.0.0.1`: a green/red status banner, severity chips, one card per finding with a collapsible **Evidence** block, and a **Copy** button next to every fix. Hit **Re-run checks** to get a fresh report. Pure HTML/CSS/JS — no frameworks, no build step.

Exit code: `0` if nothing serious was found, `1` if there are high/medium findings, `2` on errors — so you can use it in scripts and cron jobs.

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

## Roadmap

- GUI (GTK/Tauri) with a one-click report
- More checks: GPU/NVIDIA, Bluetooth, firmware (fwupd), Wayland issues
- Report history and change detection ("new since last check")
- Auto-generated, distro-specific fix instructions

## License

MIT
