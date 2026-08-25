# Dashboard & desktop app

The same report, visualized. For downloads and the CLI, see the
[README](../README.md).

## Visual dashboard (`--web`)

```bash
linux-doctor --web
```

Opens a dashboard in your browser at `127.0.0.1:43901` (a stable, predictable
URL — a second instance falls back to a free port instead of crashing). The
layout is organized into four clear zones: **identity** (logo + system info +
actions), **status** (health gauge with score/delta, a plain-language message,
and NEW/FIXED chips), **control** (severity filters with live counts, search,
Expand/Collapse all, and a Clear button), and **content** (High → Medium →
Informational → Fixed → Skipped → history trend, in that fixed order).
**High** findings are open by default; **Medium**, **Informational**,
**Fixed**, and **Skipped** collapse, so a full report fits on one screen
without scrolling. Click any finding to expand its explanation, **Evidence**,
and a **Copy** button next to the fix. Hit **Re-run checks** for a fresh
report. The dashboard **auto-refreshes** every 20s — it pauses while you are
reading (searching, filtering, or with a finding expanded) so your place is
never reset. Pure HTML/CSS/JS — no frameworks, no build step.

The **history** view draws your health-score sparkline (with date tooltips
and a dashed 50-point "needs attention" line) plus a stacked bar chart of
high/medium/info findings across recent runs, so you can see at a glance
whether problems are trending up or down. The **Skipped** section now also
lists checks skipped because they do not apply to an immutable/atomic system
(e.g. `reboot`).

**Dark/light theme:** the dashboard follows your system theme and remembers
your choice — the 🌓 button in the header cycles light → dark → auto.
**Keyboard navigation:** `↑`/`↓` move between findings, `Enter` opens/closes
the focused one. The palette is color-blind friendly: every severity has an
icon (🔴 🟡 🔵) plus a text label, never color alone. While checks re-run, a
spinner shows progress and the button is disabled.

## Desktop app (GUI)

The same dashboard, as a native desktop window — launch it, and one click on
**Re-run checks** gives you a fresh report. Built with Tauri v2: the window
is a thin Rust shell that runs the exact same Node checks
(`bin/doctor.js --json`), so there is **zero duplication** between the CLI
and the GUI — the checks are the single source of truth.

**Prerequisites:** Node.js ≥ 20 (the checks run through Node), Rust, and the
Tauri system libraries:

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

The bundled app needs `node` on PATH to run the checks. Set
`LINUX_DOCTOR_ROOT` to point at a Linux Doctor checkout if the bundled
resources are unavailable.

To put the app in your desktop menu, install the launcher (the deb/rpm
bundles ship one automatically; this is for the AppImage or manual setups):

```bash
install -Dm644 packaging/linux-doctor.desktop ~/.local/share/applications/
install -Dm644 src-tauri/icons/128x128.png ~/.local/share/icons/hicolor/128x128/apps/linux-doctor.png
```
