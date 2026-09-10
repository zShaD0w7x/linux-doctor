# Security & Quality Audit — desktop/app delta (post-0.5.0)

> Date: 2026-09-10 · Scope: `0732902..HEAD` — 16 files, ~1150 lines: Tauri shell (tray, single-instance, autostart, adaptive window, HTTP response fix), GUI wide-mode + master-detail + URL state, Node-runtime bundling + release CI. Parallel surface audits (Rust / GUI / CI), line-verified; top findings reproduced live.
> Baseline: [audit-0.5.0.md](audit-0.5.0.md).

## Executive summary

**No Critical findings.** The delta is structurally sound: the HTTP header bug that broke the app is fixed with a regression test, the tray fails soft, every new spawn is argument-array based, the detail-pane escaping holds under a live review, and new deps are on patched lines (`tauri 2.11.5`, `event-listener 5.4.2`).

What needs attention:
1. **Supply chain** — mutable action refs (`dtolnay/rust-toolchain@stable` is a branch) in a workflow holding `contents: write` + `id-token: write`.
2. **Stale bundled Node** — `v22.14.0` (Feb 2025) misses four tagged security releases; shipped in every package.
3. **URL-state feature half-broken + persists search text** (both reproduced live).
4. **Autostart silently fails/misreports.**

The previous audit's 2 High + 1 Medium remain **open** (CLI-side, untouched here).

## 1. Status of the previous audit (verified today)

| ID | Finding | Status |
|---|---|---|
| H1 | `</script>` breakout in `--html` (`cli.js:1012`) | **Open** |
| H2 | ReDoS in `scrub()` IPv6 (`support.js:35`) | **Open** |
| M1 | Unescaped `distro/kernel/uptime` (`render-status.js:71-73`) | **Open** |
| M2–M8, L1–L12 | Privacy parity, config perms, egress validation | Not re-audited (unchanged) |

## 2. New findings

### High
- **N1 — Mutable action refs with release-write + OIDC.** `release.yml:22,23,66,67,138,139` (`actions/*@v4`), `:43,116` (attest@v2), `:54,120` (gh-release@v2), `:85` (rust-cache@v2), `:84` (`dtolnay/rust-toolchain@stable` — a branch); workflow-level `contents: write, id-token: write, attestations: write` (`:11-14`) inherited by both build jobs. A hijacked action can publish releases and mint attestations.
- **N2 — Bundled Node pinned to a stale patch.** `scripts/fetch-node-runtime.mjs:18` → `v22.14.0` (2025-02); latest v22.x is v22.23.2 (2026-07), four security releases skipped. Node 22 is Maintenance LTS (EOL 2027-04-30); Node 24 is current LTS.

### Medium
- **N3 — `?view=` deep links overridden by the remembered view (reproduced live).** `applyUrlState` sets `activeView` (`ui-views.js:57`), then `setupViews` overwrites it from `localStorage` (`ui-views.js:160-163`), because `setupUrlSync` runs first (`init.js:270-271`). Live: with `ld-view=history`, `/?view=checks` rendered History. Contract in `ui-views.js:11-14` says otherwise.
- **N4 — Unbounded concurrent scans/threads on the local API.** Tray "Run checks now" has no in-flight guard (`lib.rs:548-558`, `run_cli` `:174-189`); report server is thread-per-connection with no read timeout (`:210-215`, `:311-328`) and `/report` spawns a full scan per request (`:396-402`). Same-user local DoS, not disclosure.
- **N5 — Autostart silently fails/misreports.** `lib.rs:561-566` discards `enable()/disable()` results, logs intent, checkbox read once (`:523-525`) and auto-toggled by muda.
- **N6 — Same-origin \"integrity\" only; the claim overstates it.** `fetch-node-runtime.mjs:23-35` gets tarball + `SHASUMS256.txt` from the same origin, no hardcoded hash, no GPG on the `.sig`. Covers corruption, not origin compromise/MiTM. `CHANGELOG.md:43` reads as a tamper guarantee.
- **N7 — `workflow_dispatch` has no tag guard; build jobs carry write perms.** `release.yml:6`; no `startsWith(refs/tags/v)` gate (only the disabled npm job), `gui` job (`:62-64`) doesn't override permissions, no protected environment/concurrency → a write-level insider can publish a branch build with attestation.
- **N8 — No CI smoke test that packages contain `runtime/node`** after `tauri build` (`release.yml:95`). (Missing resource would fail the build; residual risk is stale/substituted binary.)
- **N9 — Search text persisted to URL/history (privacy, reproduced live).** `syncUrlState` writes `#search.value` via `replaceState` per keystroke (`ui-views.js:21-29` from `ui-filters.js:82`). Live: `?q=systemd+password+hostname`. Hostnames/units/paths/usernames land in session restore, copy-paste, screenshots, browser sync.

### Low
- **N10** AppImage autostart `Exec=` unquoted (`auto-launch 0.5.0`) — paths with spaces fail; stale if moved.
- **N11** Single-instance D-Bus name: same-user raise/focus or squat to block launch.
- **N12** Tray temp icon falls back to world-writable `/tmp/tray-icon` when `XDG_RUNTIME_DIR` unset.
- **N13** Autostart toggle can panic (`home_dir().unwrap()`) outside the tray `catch_unwind`.
- **N14** Env discipline narrower than the comment: only `LD_LIBRARY_PATH`/`LD_PRELOAD` stripped; `NODE_OPTIONS`/`NODE_PATH`/`PATH` inherited.
- **N15** Fetch script: predictable `/tmp` paths, no `O_EXCL`/`O_NOFOLLOW`, no `finally` cleanup (~143 MB).
- **N16** Fetch not hooked into `tauri build`: gitignored `runtime/` is packaged as-is locally; `cp` follows a symlink at `DEST`.
- **N17** Dead opaque footer rule: `wide.css:45` overridden by later same-specificity `:89-93` (92% + blur) — see-through status bar artifact remains.
- **N18** `aria-pressed` stale when grouping comes from the URL (`ui-views.js:63-64` vs `ui-sidebar.js:100-101`).
- **N19** `#nomatch` auto-places in the pane column at wide (`.reportgrid`, `wide.css:51-56`).
- **N20** `esc(sev)`/`dur` unescaped in the pane (`ui-detailpane.js:23,37`) — schema-constrained, defense-in-depth.
- **N21** Zero coverage of the new surface; `gui-smoke.test.js:64` stubs `window.matchMedia` while code calls bare `matchMedia` (`ui-wide.js:9,36`) → wide path never runs despite `matches:true`.
- **N22** README still says Node ≥20 required and "planned" runtime (`README.md:38-39,62`).
- **N23** No Node LICENSE / license metadata in packages.
- **N24** Concurrent history writes share one `.tmp` (`history.js:118`).
- **N25** `devtools` in release (`Cargo.toml:17`); CSP `script-src 'unsafe-inline'` (`tauri.conf.json:25`, carries previous L9).

## 3. Verified good

| # | Guard | Where |
|---|---|---|
| G1 | Response head exactly one terminator, both CORS cases, regression test | `lib.rs:302-306,681-695` |
| G2 | No header splitting: status literal, cors from validated Origins, `head.lines()` can't carry CRLF | `lib.rs:285-295,457-463` |
| G3 | Host + Origin guards before any write, tested | `lib.rs:352-370,644-678` |
| G4 | All new spawns argument-array, no shell; `--notify` carries counts only | `lib.rs:556`, `notify.js:41-48` |
| G5 | Tray fail-soft installs no orphan handler | `lib.rs:493-500,543-545` |
| G6 | No hidden-forever window: `show()` unconditional | `lib.rs:590-598` |
| G7 | Deps patched: tauri 2.11.5 (CVE-2026-42184), event-listener 5.4.2 | `Cargo.lock` |
| G8 | Capabilities: `core:default` only; autostart not exposed to webview | `capabilities/default.json:6` |
| G9 | Runtime inside attested artifact subjects | `release.yml:115-118` |
| G10 | `.gitignore` keeps the 120 MB binary untracked | `.gitignore:14` |
| G11 | Pane escaping sound (free text `esc`, `evId` sanitized, `wrongUrl` encoded) | `ui-detailpane.js:17-47,33,44` |
| G12 | URL params validated against sets; unknown ignored | `ui-views.js:38-50` |
| G13 | Narrow <1440 unchanged; pane hidden by default | `ui-wide.js`, `ui-detailpane.js:84-106` |
| G14 | Hoisting/TDZ safe; real `syncDetailPane` wins | `build-gui.mjs:49-50` |
| G15 | Sticky z-order coherent; pane clears toolbar | `layout.css:4,126`, `wide.css:90` |

## 4. Top risks

1. **Release supply chain (N1)** — most direct route to a malicious signed release.
2. **Stale bundled Node (N2)** — certain, ongoing exposure in every package.
3. **URL-state broken + search-in-URL (N3/N9)** — the new headline feature doesn't fully work and stores system-derived text where it shouldn't.
4. *(carried)* **Previous P0s still open** — H1 `</script>` export, H2 ReDoS.

## 5. Recommended fix order

- **P0 this week:** N1 pin actions to SHAs + `persist-credentials:false` + least-privilege jobs; N2 bump Node (and automate); N3 URL view precedence (+ N9 decide: keep only non-text state in URL or drop `q`); N17 footer opaque.
- **P1:** N5 autostart truthfulness; N7 tag-guarded publish + environment; N8 packaging smoke test; N21 test-harness fix (bare `matchMedia`) + first tests for URL/pane.
- **P2:** N4 throttle/coalesce scans; N6 hardcoded hash/GPG; N16 hook fetch into build; N22 README; low-tier hygiene (N10–N15, N18–N20, N23–N25).
- **Carried over from 0.5.0:** H1, H2, M1 (cheap, high-value).
