# UI Audit: desktop feel of the dashboard — linux-doctor 0.5.0

> Date: 2026-09-08 · Question: *"does the dashboard read as a PC/laptop interface, or as a phone app?"* · Method: live screenshots at 390 / 1440 / 1920 (evidence in `docs/screenshots/audit-2026/`), CSS/media-query audit, Vercel Web Interface Guidelines ruleset. Companion plan: [research-desktop-ui-2026.md](research-desktop-ui-2026.md). Regenerate evidence with `node /tmp-opencode-style script` — see §Method.

## Executive verdict

**It is a phone-first layout with exactly one desktop concession** (the ≥1100px sidebar rail). Above 1100px the app does not adapt — it merely centers: `.wrap { max-width: 1100px }` (`base.css:44`), `.content`/`#report` capped at 1040 (`layout.css:162-163`), and **no media query in the entire GUI above 1100px** (largest: `@media (min-width: 1100px)` at `layout.css:248`). On a 1920×1080 monitor roughly **55–60% of the pixels are empty black margins** (see `before-1920.png`). The narrow 390px layout, by contrast, is genuinely good (`before-390.png`).

The five views are five *scrolls*, not five *workspaces*: every view is a single centered column; nothing pairs a list with a detail pane, and the left rail (240px) dies after its three legend blocks, leaving half the viewport idle while the main column keeps scrolling.

## The 3 material findings (ordered by user impact)

### 1. Viewport ceiling: the app ends at 1100px
- **Evidence:** `before-1920.png` — content block ~1120px wide, vast symmetric voids. `.wrap` cap `base.css:44`; content caps `layout.css:162,163`; component caps `components.css:12,24,36,71,88` (all 1040px) and `components.css:185` (740px). Only breakpoints: `max-width: 700px` (`responsive.css:2`), `max-width: 1099px` (`responsive.css:35`), `min-width: 1100px` (`layout.css:248`). Body padding fixed `32px 20px 80px` (`base.css:41`).
- **Impact:** on the primary "PC/laptop" surfaces (1366–1920+), the product visibly wastes the screen — the opposite of what a system dashboard should do. Cockpit/Beszel/Grafana all treat wide viewports as their *default* canvas.
- **Smallest correction:** keep everything ≤1439px exactly as-is; add a `@media (min-width: 1440px)` shell that un-caps (sidebar fixed + fluid main, 12-col grid) and reuses the existing variables.

### 2. Single-pane workflow: no master–detail anywhere
- **Evidence:** the findings list and its detail share one column (`before-1440-full.png`): the START HERE card is the *expanded copy* of the first finding — which also appears again in the "2 issues need attention" list right below; sections render as collapsed accordions (▸ "7 findings — review soon", "20 observations", "Fixed since last check", "Skipped checks", "Changes since last run") that each cost a scroll trip. The left rail's legends (`WHY THIS SCORE`, `SEVERITY`, `CATEGORIES`) end at ~y=1090 on a 1690px-tall page — the remaining ~600px of rail are dead space while the main column continues.
- **Impact:** the two core desktop interactions — *scan a dense list with your eyes, keep a detail pinned while the selection changes* — are impossible. Desktop convention (mail clients, Cockpit lists, IDEs, Mission Center) is list+detail side by side.
- **Smallest correction:** at ≥1440, Overview becomes list (left) + persistent detail pane (right). The START HERE card *becomes* the detail pane (default selection = top finding) — no content lost, no duplication; accordions become dense tables at this width and stay accordions on touch widths.

### 3. Mobile scale wearing desktop clothes
- **Evidence:** hero numeral ~56–64px in a ~250px-tall card; 32px body padding; pill/radio controls with large paddings (`before-1440.png`); the Density button exists but the default above 1100px is still the airy one. Contrast: the evidence block already uses mono, tabular figures — the *data* styling is desktop-grade, the *chrome* is not.
- **Impact:** a monitoring tool that shows one finding per screenful reads as a landing page, not a workbench; technical users (the target audience) notice immediately.
- **Smallest correction:** at ≥1440 default to the compact density (the existing Density toggle keeps final say), drop hero numeral to ~40px / gauge ~72px, tighten section spacing 32→20, row height ~30px.

## What already reads desktop (keep, do not regress)

- Cockpit-style sidebar rail with live count badges, keyboard `1`–`5` + arrows + `/` + `Esc` (`layout.css:248-266`, footer hints)
- Stat tiles + score delta + sparkline in the hero; `WHY THIS SCORE` rail with penalty bars
- Evidence rendered as mono/tabular-nums tables; `codepill` copy affordances
- Export ▾ menu, Auto-refresh control, Density toggle, 4 themes incl. Terminal (variables-only, must hold in any new layout)
- Print stylesheet (`print.css`), a11y pass from 0.5.0 (focus-visible, aria, roving tabs)

## Guidelines deltas (Vercel Web Interface Guidelines — relevant subset)

| Rule | Status | Where |
|---|---|---|
| URL reflects state (tabs, filters) | ✗ — views/filters/search live only in `localStorage` (`ui-views.js:18,72` `ld-view`) | add `?view=&sev=&q=` sync → deep-linkable desktop state |
| `tabular-nums` on number columns | ◐ — badges/sparkline yes; severity counts + hero delta need a sweep | `layout.css:241` has it; extend to lists |
| `text-wrap: balance` on headings | ✗ not set | one CSS line on card titles |
| Focus states | ✓ (0.5.0 a11y pass) | — |
| Icon-only buttons `aria-label` | ✓ | header controls |
| `color-scheme` / theme-color | ◐ — themes swap variables; verify `color-scheme` + `theme-color` meta follow the active theme (scrollbar/input dark rendering) | `ui-theme.js` |
| Virtualization for >50 lists | ✗ but N≤~30 findings typical; checks matrix 49 rows — `content-visibility: auto` on rows is a cheap win | `ui-checks.js` |

## Method

- Screenshots: Playwright (repo's cached Chromium) against the live `node bin/doctor.js --web` at 390×844 (full), 1440×900 (viewport + full), 1920×1080 (viewport), dark theme — saved as `docs/screenshots/audit-2026/before-*.png`.
- CSS audit: all 6 files in `src-gui/css/` read; every `max-width`/`@media` enumerated.
- Ruleset: Vercel Web Interface Guidelines (fetched 2026-09-08) applied to the delta that matters for the desktop question; full a11y compliance was separately verified in the 0.5.0 pass and is not re-audited here.
