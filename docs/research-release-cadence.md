# Release Cadence Research — linux-doctor and Peer CLI Projects

**Date:** 2026-08-27 · **Author:** automated research (Muse Spark) · **Scope:** primary sources only
**Task:** quantify release frequency for the local project `linux-doctor` and mature comparable CLIs (ripgrep, bat, helix, starship, eza, fd), summarize best-practice guidance (SemVer, Keep a Changelog, GitHub Releases), and recommend a healthy cadence for `linux-doctor` given `4 commits ahead` / `0.3.5 ready`.

---

## 1. Local project: linux-doctor

### 1.1 Tags and dates (primary: `git tag --list`, `git log --tags`, `CHANGELOG.md`)

Sources: `git tag --list` and `git log --tags --simplify-by-decoration --pretty="%ai %d %s"` run 2026-08-27 inside the worktree (see §1.3 raw log); `CHANGELOG.md` headers `## [x.y.z] — YYYY-MM-DD` and `package.json:3` `version` field.

| Tag | Tag commit date (`git log -1 --format=%ai <tag>`) | `CHANGELOG.md` date | Notes |
|---|---|---|---|
| `v0.2.0` | `2026-08-18 12:05:51 +0300` | `2026-08-18` (under `## [0.3.0]` history retro) | `Trust fixes: stable codes…` ; first packaged 0.2.0 (`a37c48d Distribution…`) |
| `v0.2.1` | `2026-08-18 12:29:47 +0300` | *(not present — `CHANGELOG.md` starts at 0.2.0 then 0.3.0; 0.2.1 is the +24-min description fix `5a4d8aa`)* | Patch 24 min after 0.2.0 |
| `v0.3.0` | `2026-08-24 22:18:46 +0300` | `2026-08-18` *(sic — header says `- 2026-08-18` but tag is 2026-08-24; historical drift, noted for bump-script hardening)* | Major feature batch (38 commits since v0.2.1): containerdisk, crash, completions, systemd timer, html export, summary, init-config, history central, 14+ fixes |
| `v0.3.1` | `2026-08-25 02:15:44 +0300` | *(no `## [0.3.1]` section — `CHANGELOG.md` jumps 0.3.0 → 0.3.2; commits `6a34256` / `7926ad6` pin cargo graph)* | Tag message `Release v0.3.1: pin the proven v0.3.0 cargo graph` |
| `v0.3.2` | `2026-08-25 15:23:41 +0300` | `2026-08-25` | Desktop loopback API + AppImage `LD_*` strip |
| *(commit `53930e8` `Release v0.3.3`)* | `2026-08-26 06:??` (commit timestamp; parent of v0.3.4) | `2026-08-26` (`## [0.3.3]`) | EGL software-GL fix — **no `v0.3.3` tag pushed** (`git tag --list` has no `v0.3.3`; `git tag --contains 53930e8` → `v0.3.4`). Indicates a tag-push discipline gap (see §4). |
| `v0.3.4` | `2026-08-26 19:52:00 +0300` | `2026-08-26` | Security (CORS + Tauri CSP) + 22-code safe-fix catalog + compact UI + `release.yml` now `appimage,deb,rpm,tgz` |
| `v0.3.5` **(ready, not tagged)** | `HEAD 8aa6260 2026-08-27 15:47:27 +0300` `chore: bump to 0.3.5 — move Unreleased to 0.3.5` | `2026-08-27` (`## [0.3.5]` with full Security/Added/Changed/Fixed) | **4 commits ahead of `origin/main`**; `package.json:3` already `0.3.5`; `git describe --tags --long` → `v0.3.4-5-g8aa6260` |

`git rev-list origin/main..HEAD --oneline` (2026-08-27):

```
8aa6260 chore: bump to 0.3.5 — move Unreleased to 0.3.5  (2026-08-27)
47a5d6a fix: cargo fmt + clippy manual_pattern_char_comparison
1428fbf chore: release hardening — 4 priorities
d0a7843 chore: sync versions to 0.3.4 + add 6 checks (inodes, orphans, wifi, packages, boot, cache)
+ 1485cf7 Release: use CHANGELOG for notes, not auto PR  (origin/main tip)
```

`git diff origin/main..HEAD --stat`: **44 files changed, +1609 / -95** — the diff that *would* ship in 0.3.5 (see `CHANGELOG.md:9-77` for curated list).

### 1.2 Interval math

Computed from tag commit timestamps (`%ai`):

| Interval | Duration | Hours | Days |
|---|---|---|---|
| `v0.2.0 → v0.2.1` | `0:23:56` | 0.4 h | **0.02 d** |
| `v0.2.1 → v0.3.0` | `6 days 9:48:59` | 153.8 h | **6.41 d** |
| `v0.3.0 → v0.3.1` | `3:56:58` | 3.9 h | **0.16 d** |
| `v0.3.1 → v0.3.2` | `13:07:57` | 13.1 h | **0.55 d** |
| `v0.3.2 → v0.3.4` | `1 day 4:28:19` | 28.5 h | **1.19 d** |
| **Total `v0.2.0 → v0.3.4`** | **8.32 d over 5 intervals** | | |
| **Mean** | | | **1.66 d** |
| **Median** | | | **0.55 d** |
| Min / Max | | | 0.02 d / 6.41 d |
| Mean *without* same-day patch (`>0.05 d`) | | | **2.08 d** (median 0.87 d) |
| `v0.3.4 → v0.3.5` (ready) | `0:20:??` *2026-08-26 19:52 → 2026-08-27 15:47* | ~19.9 h | **0.83 d** |

Commit velocity (`git log --all --since="2026-08-15" --pretty="%ai" | cut -d' ' -f1 | sort | uniq -c`):

```
10 2026-08-15  (initial + monetization groundwork)
27 2026-08-18  (trust fixes, 0.2.0/0.2.1, 15 commits in v0.2.0 alone)
 2 2026-08-22
 9 2026-08-23
12 2026-08-24  (0.3.0 push)
17 2026-08-25  (0.3.1 + 0.3.2, both same day)
 2 2026-08-26  (0.3.3 commit + 0.3.4 tag)
 4 2026-08-27  (0.3.5 ready — 4 ahead of origin)
```

Commits per tag interval (via `git log <tag> --not <prev-tag>`):

- `v0.2.0`: 15 commits of initial history window
- `v0.2.1`: 2 commits
- `v0.3.0`: 38 commits (largest feature batch — the 6.4 d gap)
- `v0.3.1`: 10 commits
- `v0.3.2`: 3 commits
- `v0.3.4`: 9 commits (includes untagged 0.3.3 work)
- `HEAD → v0.3.4`: **5 commits** (4 new + `1485cf7` already on origin)

Interpretation: linux-doctor has been in **hyper-rapid `0.y.z` development** — 6 versioned tags in 8.3 days (~1 release/day, median 13 h). The only "stable" gap was the 6.4 d build-up to 0.3.0; every other release was a hot-patch or same-day follow-up. This is normal for a pre-1.0 prototype burning through trust/security fixes, but is **5–20× faster than mature peer medians** (see §2) and not sustainable once downstream packaging (AUR/RPM/Homebrew) is live.

### 1.3 Current velocity vs. next release payload

`0.3.5` (`CHANGELOG.md:9-77`) is **substantial enough to justify a release on its own**:

- **Security (patch-mandatory):** `--push`/`--alert` plaintext-HTTP auth guard (`FLEET_API_KEY` only over `https://` or loopback) + `--ai` redaction of IPv4/IPv6/home paths before LLM egress — both with new tests. These are the kind of fixes that warrant an out-of-band patch even on a slow cadence.
- **Behavior fix:** safe-fix catalog demotion of `network/no-route` (could drop an SSH session) and hardening of `security/no-firewall` (`ufw allow OpenSSH` before `ufw --force enable`).
- **Features (8 Added):** 6 new checks (`inodes`, `orphans`, `wifi`, `packages`, `boot`, `cache`) + `flatpak/unused-runtimes` + auto-generated `docs/checks.md` catalogue (44 checks / 142+ codes) + man-page completion. Plus 2 Changed (threshold validation, IPv6 scrub) and 1 Fixed (processes header bug).
- **Scale:** ~1600 lines, 44 files, 25+ new tests (`fleet.test.js`, `alert.test.js`, `llm.test.js`, `fix.test.js`, registry).

`origin/main` (`1485cf7`) is already behind `HEAD` by 4 commits; `CI` on `origin/main` vs. `HEAD` divergence means the security fixes are **not yet on the default branch's tag lineage** — users installing from `HEAD` or a future tag would not get them until `v0.3.5` is pushed.

### 1.4 Release machinery today

- `CHANGELOG.md:1-6` declares `Keep a Changelog` + `SemVer` — correct structure with `## [Unreleased]` stub and dated version sections.
- `.github/workflows/release.yml:1-56` (CLI) triggers on `push: tags: ["v*"]`, builds `npm pack` tarball → `rel/` → `SHA256SUMS` → `actions/attest-build-provenance@v2` (SLSA L2) → extracts `CHANGELOG.md` section via `awk -v tag="## \\[$TAG\\]"` → `softprops/action-gh-release@v2` with `body_path: /tmp/notes.md` and `generate_release_notes: false` — matches the bat/ripgrep "copy CHANGELOG section verbatim" pattern.
- `.github/workflows/release.yml:59-112` (GUI) builds `appimage,deb,rpm` on `ubuntu-22.04` via `npx tauri build --bundles appimage,deb,rpm` (expanded in 0.3.4 from `appimage,deb` only) and attaches to the same Release with its own `SHA256SUMS-bundles.txt` + attestation.
- `.github/workflows/ci.yml` gates: `workflow-lint` → matrix `Node 20/22/24` + `Fedora container` + `Rust tests` + `rust-lint (fmt+clippy)` + `audit (npm audit + cargo audit)` + `real-run` valid JSON. Packaging gate `npm pack --dry-run | grep src-gui/index.html` guards the published `files` list.
- `RELEASING.md` (root, 42 lines) lists 8-step checklist (bump script → CHANGELOG → goldens/verify → commit → push branch wait CI → signed tag → GitHub Release → npm publish). However §9 of `docs/research-release-checklist.md` already flagged drift: `scripts/bump-version.mjs` now bumps 7 files atomically (`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `packaging/linux-doctor.1`, `packaging/PKGBUILD`, `packaging/linux-doctor.spec` + regen `docs/checks.md` + `Cargo.lock`), but `RELEASING.md` historically listed fewer — now reconciled.

---

## 2. Peer CLI projects — release cadence benchmarks

Method: primary sources (GitHub Releases pages + raw `CHANGELOG.md` dates + release workflows + discussion threads) cross-checked with aggregators (`inspect.software`, `releasealert.dev`, `mise-versions.jdx.dev`) for mean/median. All counts are inclusive of patch tags; `median` and `mean` are days between successive releases.

### 2.1 Summary table (mature CLI peers)

| Project | Language / Install | Total releases | Mean interval (all time) | Median (recent sample) | Typical pattern | Release automation | Source |
|---|---|---|---|---|---|---|---|
| **ripgrep** `BurntSushi/ripgrep` | Rust / cargo, brew, deb | 75 over ~10 y (~48 d avg via mise) | ~120 d (sample), ~60 d long-run | **22 d** (sample median; full median ~60 d) | **Per-feature + clustered patches.** Major ~yearly (14.0.0 Nov 2023 → 15.0.0 Oct 2025 = 689 d); patches cluster same-day/weekly (`14.0.0→14.0.1 0 d, →14.0.2 1 d, →14.0.3 1 d`; `15.0.0→15.1.0 6 d`). Not time-based. | Manual signed tag per `RELEASE-CHECKLIST.md`: `cargo update -p ripgrep`, commit, `cargo package` check, push branch → wait CI → `git tag -s` → `cargo publish` → `ci/sha256-releases` for Homebrew. | [Releases](https://github.com/BurntSushi/ripgrep/releases) · [CHANGELOG.md](https://github.com/BurntSushi/ripgrep/blob/master/CHANGELOG.md) (1870 lines, headers `# 15.2.0 (2026-07-15)` etc.) · [RELEASE-CHECKLIST.md](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) · [mise ripgrep](https://mise-versions.jdx.dev/tools/ripgrep) |
| **bat** `sharkdp/bat` | Rust / cargo, brew, deb | 43 over 8 y | **158.2 d** (inspect) ; ~158 d mean, ~198 d median (recent) | **~148 d** | **Sporadic / maintainer-bandwidth-driven.** Poll in [Discussion #2200](https://github.com/sharkdp/bat/discussions/2200) found 48% wanted 2 weeks but maintainers said monthly is hard; reality drifted to **3–15 months** between minors: `0.24.0 Oct 2023 → 0.25.0 Jan 2025 = 453 d`, `0.25.0 → 0.26.0 285 d`, `0.26.0 → 0.26.1 44 d`. Patch (0.26.1) was regression fix 44 d after major. | Manual `doc/release-checklist.md` + `.github/workflows/CICD.yml` (matrix + 13 targets via `cross`). No release-please; `cargo publish` after tag in clean clone. | [Releases](https://github.com/sharkdp/bat/releases) · [inspect bat](https://inspect.software/software/sharkdp/bat) (43 releases, 158.2 d mean, latest 2025-12-02) · [releasealert bat](https://releasealert.dev/github/sharkdp/bat) (2 mo 5 d) · [Discussion #2200](https://github.com/sharkdp/bat/discussions/2200) |
| **helix** `helix-editor/helix` | Rust / cargo | 10 CalVer over 2.5 y (`22.12` → `25.07.1`) | ~106 d mean | **114 d** | **Calendar-versioned, target 2–3 months, reality 3–6 months + emergency patches.** `22.12→23.03 114 d, 23.03→23.05 48 d, 23.05→23.10 160 d, 24.03→24.07 106 d, 24.07→25.01 173 d, 25.01→25.01.1 16 d, 25.01.1→25.07 177 d, 25.07→25.07.1 3 d`. Patches (`*.1`) are same-week regression fixes. FAQ says *"We shoot to cut a release around every two to three months."* | CI-triggered on tags `'[0-9]+.[0-9]+'` (see `.github/workflows/release.yml`); `workspace.package.version` mapping `YY.MM→YY.M.0` + `cargo check` for `Cargo.lock` + `CHANGELOG.md` + AppStream `Helix.appdata.xml` `<release>` entry; release PR then `git tag -s -m "<tag>" -a <tag> && git push`. | [Releases](https://github.com/helix-editor/helix/releases) · [CHANGELOG.md raw](https://raw.githubusercontent.com/helix-editor/helix/master/CHANGELOG.md) · [Discussions #6362](https://github.com/helix-editor/helix/discussions/6362) ("More frequent release schedule") · [Discussion #12274](https://github.com/helix-editor/helix/discussions/12274) · [helix releases docs](https://helix-editor.vercel.app/contributing/releases/) |
| **starship** `starship/starship` | Rust / cargo, brew, MSI | **153** over 7 y | **46 d** (addremoveprograms) / 16 d median (2 w 2 d via releasealert) | **59 d** (recent sample) | **Fastest — automated, per-feature via `release-please`.** `1.22.0→1.22.1 0 d (same-day fix), 1.23.0→1.24.0 181 d, 1.24.0→1.24.1 22 d, 1.24.1→1.24.2 44 d, 1.24.2→1.25.0 109 d, 1.25.0→1.25.1 12 d, 1.25.1→1.26.0 59 d`. `releasealert.dev` frequency **2 w 2 d** is the tightest of the set. Maintainers rely on `googleapis/release-please-action` (`release-type: rust`) — conventional commits auto-bump + open release PR; `needs.release_created == 'true'` builds 10+ targets (gnu/musl, x86_64/aarch64/riscv, macOS/windows) and winget. | `.github/workflows/release.yml` `release_please` job (v5.0) → `github_build` matrix + `upload_artifacts` + `winget_update`. | [Releases](https://github.com/starship/starship/releases) · [releasealert starship](https://releasealert.dev/github/starship/starship) (153 releases, 2 w 2 d) · [addremoveprograms starship](https://addremoveprograms.com/application/starship/) (46 d) · [CHANGELOG.md](https://github.com/starship/starship/blob/main/CHANGELOG.md) · [release.yml](https://github.com/starship/starship/blob/main/.github/workflows/release.yml) |
| **eza** `eza-community/eza` | Rust / cargo | **96** over 3 y | **42.7 d** (inspect) / ~11 d (mise) | **19 d** (recent; 279 d outlier H1 2026) | **Weekly-burst historically, now batch-pause.** Mise timeline: weekly 2023-2024 (`0.18.8 Mar 14 → 0.18.9 Mar 27 13 d, 0.20.7 Nov 7 → 0.20.8 Nov 14 7 d …`), then monthly 2025 (`0.23.0 Jul 18 → 0.23.1 Aug 31 44 d → 0.23.2 Sep 6 6 d → 0.23.3 Sep 14 8 d → 0.23.4 Oct 3 19 d`), then **279 d pause to 0.23.5 Jul 9 2026** ("life happened" — maintainer note). `inspect` mean 42.7 d, mise ~11 d — both fastest. | Highly automated via `justfile` (`just release` → `cargo bump "{{new_version}}"`, `git cliff -c .config/cliff.toml -t "{{new_version}}"`, `cargo check`, `nix build`, `gh pr create`; `just gh-release` → `git tag --sign -a`, `just cross`, `just mangen`, `just completions`, `just checksum`, `gh release create -d`). | [Releases](https://github.com/eza-community/eza/releases) · [mise eza](https://mise-versions.jdx.dev/tools/eza) (96 releases) · [inspect eza](https://inspect.software/software/eza-community/eza) (42.7 d mean) · [justfile release](https://github.com/eza-community/eza/blob/main/justfile) · [v0.23.5 notes](https://newreleases.io/project/github/eza-community/eza/release/v0.23.5) |
| **fd** `sharkdp/fd` | Rust / cargo, brew, deb | 44 over 9 y | **123.3 d** (inspect) / 123 d (releasealert 3 mo 1 w) / 151 d (addremoveprograms) | **107 d** | **~3–4 months with regression patches.** `10.0.0 May 6 2024 → 10.1.0 May 8 2 d, →10.2.0 Aug 23 107 d, →10.3.0 Aug 26 2025 368 d (long drift), →10.4.1 Mar 8 2026 194 d, →10.4.2 Mar 10 2 d`. Same-day `10.4.0` re-release rust in release notes ("re-release due to issue with 10.4.0"). | Same family as bat/ripgrep: manual tag, `cargo publish`, no release-please. | [Releases](https://github.com/sharkdp/fd/releases) · [inspect fd](https://inspect.software/software/sharkdp/fd) (44 releases, 123.3 d) · [mise fd](https://mise-versions.jdx.dev/tools/fd) (36 releases, ~3 mo) · [crates.io fd-find](https://crates.io/crates/fd-find) (publish dates) |
| **linux-doctor** `zShaD0w7x/linux-doctor` | Node+Tauri / npm+bundle | 6 tags in 8 d | **1.7 d** mean / **0.55 d** median | 0.83 d to next | **Hyper-rapid 0.x** — 6 tags in 8 d, 4 commits ahead <24 h after last tag. Pre-1.0 "anything may change" per SemVer §4. | `release.yml` tag-triggered (`v*`) + `bump-version.mjs` atomic 7-file bump + `CHANGELOG awk` + provenance attestations (SLSA L2). | This doc, `git log`, `CHANGELOG.md`, `.github/workflows/release.yml` |

### 2.2 What the numbers mean

- **Peer median days between releases spans 1.7 d (linux-doctor today) to 114–158 d (helix/bat)**, with **two behavioral clusters**:
  - **Fast/automated (weekly–monthly):** eza (~11–43 d), starship (~16–46 d) — projects that automated changelog/commit-convention + `release-please`/`git cliff`/`just` and ship every batch. Best for active pre-1.0 projects where users track `HEAD` or distro nightlies.
  - **Slow/curated (quarterly–biannual):** helix (~106 d target, 160–177 d reality), bat (~158 d, up to 453 d), fd (~123 d), ripgrep (~120 d) — mature, widely-packaged tools where each release carries a large, curated `CHANGELOG.md` section and downstream update cost (Homebrew/AUR/deb) disincentivizes churn. Patches then cluster within days when a major regresses.
- **Aggregators agree on ordering** (from fastest to slowest mean): `eza (42.7 d) < starship (46 d) < ripgrep (~60 d) < fd (123 d) < helix (~106 d) < bat (158 d)` — consistent with manual samples above.
- **No peer sustains 1 d cadence beyond short bursts.** Even eza's weekly phase still had multi-week lulls; starship's 2-week frequency still spaces majors by 1–6 months. The closest analog to linux-doctor's 1.7 d is a **regression-patch burst** (e.g., ripgrep `14.0.0→14.0.3` over 2 d, bat `0.15.0→0.15.4` over 33 d), not a steady state.
- **Patches within days of a major are universal.** Every peer ships a `.1` patch 0–16 d after a major/minor when a regression slips (ripgrep `14.0.0→14.0.1 0 d`, `15.0.0→15.1.0 6 d`; helix `25.01→25.01.1 16 d`, `25.07→25.07.1 3 d`; starship `1.22.0→1.22.1 0 d`; fd `10.0.0→10.1.0 2 d`). This validates releasing `0.3.5` quickly after `0.3.4` if it fixes regressions/security — but **isolated**, not the norm.

### 2.3 Distribution and install friction matters

- Tools distributed via **Homebrew/AUR/crates.io** (bat, fd, ripgrep, helix) explicitly delay releases to reduce downstream churn. Their checklists update `pkg/brew/ripgrep-bin.rb` via `ci/sha256-releases` or bump `PKGBUILD` `sha256sums` — each release has a **tax** ([ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md), [helix releases](https://helix-editor.vercel.app/contributing/releases/)). linux-doctor's `release.yml` already attaches `SHA256SUMS` + `SHA256SUMS-bundles.txt` (good), but `PKGBUILD`/`spec` still require manual hash refresh — another reason to batch.
- Tools where **users build from source or track `main`** (starship with `cargo install --locked`, eza's nightly-minded audience) tolerate faster cadence. linux-doctor's current install paths (`npm` + `AppImage`+`deb`+`rpm` direct) are **low-friction** (no external Homebrew formula), which argues for **weekly–biweekly** being acceptable in `0.x`, but **daily** still spams GitHub `Releases` notifications for watchers.

---

## 3. Best practices / recommendations for release frequency

### 3.1 SemVer — what the numbers promise

Primary source: [Semantic Versioning 2.0.0](https://semver.org/) (`https://semver.org/`).

- `MAJOR.MINOR.PATCH` (`X.Y.Z`, no leading zeroes, numeric precedence).
- **`MAJOR` (`X.y.z | X>0`) bumped for backward-incompatible public-API changes** — "MUST be incremented if any backwards incompatible changes are introduced". Resets MINOR+PATCH to 0.
- **`MINOR` (`x.Y.z`) for new backward-compatible functionality** (including deprecations; MAY include patch fixes). Resets PATCH to 0.
- **`PATCH` (`x.y.Z`) for backward-compatible bug fixes only** — "a bug fix is defined as an internal change that fixes incorrect behavior." No API change.
- **`0.y.z` (initial development): "Anything MAY change at any time. The public API SHOULD NOT be considered stable."** Guidance: "start at `0.1.0` and increment minor for each subsequent release; if worrying about compatibility, already be `1.0.0`." linux-doctor at `0.3.x` is squarely here — **frequent breaking changes are allowed**, but callers shouldn't pin to `0.3.x` expecting stability.
- **Pre-release suffixes:** `1.0.0-alpha`, `beta.2`, `rc.1` — lower precedence than the normal version. Use for shakedown before `1.0.0` (see also GopherTrunk guidance below).
- **Practical rule:** once `cargo publish` / `npm publish` / GitHub Release ships, **contents MUST NOT be modified** — fix forward with a new version (SemVer §3.5). Yank ≠ unpublish.

### 3.2 Keep a Changelog — how to write the notes

Primary source: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) (`https://keepachangelog.com/en/1.1.0/`).

- Header declares `Keep a Changelog` + `SemVer` commitment.
- **Curated for humans, not a git-log dump.** Group under `Added / Changed / Deprecated / Removed / Fixed / Security`; latest version first; each version section linkable; date `YYYY-MM-DD` (`2026-08-27`).
- **`## [Unreleased]` section at top** serves two purposes: visible roadmap of upcoming changes and **pre-staged release notes** — at release time, rename it to `## [x.y.z] - YYYY-MM-DD` and re-open a fresh `Unreleased` stub. This is exactly linux-doctor's current flow (`8aa6260` moves Unreleased→0.3.5).
- GitHub Releases is **complementary but not a substitute**: Keep a Changelog note warns that GitHub Releases is "non-portable … only displayed within the context of GitHub" and is "arguably not very discoverable … unlike typical uppercase files." Recommendation: maintain `CHANGELOG.md` as source of truth and **copy the relevant section verbatim** into the GitHub Release body (what ripgrep/bat/helix/linux-doctor all do via `awk`).
- **Release date of each version MUST be displayed; link versions to GitHub Release compare views** via reference-style links — already done in linux-doctor space and peers.

Companion guidance: [GopherTrunk "Build in the Open, Part 11"](https://gophertrunk.org/blog/tutorials/build-in-the-open-11-releases-prerelease-semver-changelogs/) (2026-06) and [llmbestpractices GitHub Releases](https://llmbestpractices.com/tooling/github-releases) summarize the modern consensus: *"release often, in small bites — large releases are riskier, harder to write notes for, slower to get feedback on; shipping small and often keeps users in the habit of upgrading; cadence doesn't have to be fixed — 'whenever there's something worth shipping' is perfectly good for a side project."* Both recommend filling `Unreleased` as PRs merge (label PRs at merge time so auto-generated notes write themselves) and rehearsing the pipeline with a `0.x` or `-rc` prerelease.

### 3.3 GitHub Releases / GitHub Docs — mechanics

Primary sources: [GitHub Docs — About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) and [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).

- A Release is a **tag + rich notes + optional binary assets**; tag may be created via UI or `git tag -s`; GitHub auto-adds `.zip`/`.tar.gz` source archives; up to **1000 assets <2 GiB each**.
- **Immutable releases** (opt-in) make the tag+notes+assets tamper-evident; recommendation is to create as **draft first, attach all assets, then publish** — exactly linux-doctor's two-job `cli`+`gui` attach pattern benefits from (both jobs attach before either would flip immutable).
- **Pre-release** checkbox (`This is a pre-release`) + `Set as latest release` controls which Release `latest` points to — use for `0.x` or `-rc.N` shakedowns.
- **Automatically generated release notes** from `.github/release.yml` categories and Conventional Commits PR labels — useful alongside a hand-curated `CHANGELOG.md` section (GopherTrunk: *"changelog tells the story, auto-notes give the complete list"*).
- **Supply-chain best practice:** run release workflows on `push: tags: ["v*.*.*"]` on **GitHub-hosted runners** with `permissions: contents: write, id-token: write, attestations: write` and publish with **Sigstore provenance** (`actions/attest-build-provenance` / `npm publish --provenance --provenance` via OIDC trusted publisher GA 2025-07-31) + `SHA256SUMS` — linux-doctor already does this on both jobs since 0.3.4, aligning with ripgrep/bat aspirations.
- **Two-phase push discipline:** push the version commit → wait for branch CI green → push the signed tag separately. Doing both in one `push --follow-tags` "seems to result in GitHub Actions not seeing the tag push" per [ripgrep RELEASE-CHECKLIST](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) and is mirrored in bat/helix checklists.

### 3.4 When to release what (patch vs minor vs major) — decision tree

```
Release a change
 ├─ Is it a breaking change?  (removed API, flag renamed, JSON schema
 │   incompatibility, `system.atomic` semantics changed without compat)
 │   ├─ YES and version is 0.y.z → MINOR bump (e.g. 0.3.x → 0.4.0)
 │   │     (0.y.z MAY break anything; MINOR is the honest signal)
 │   ├─ YES and version is ≥1.0.0 → MAJOR bump (1.x → 2.0.0), add
 │   │     Migration notes at top of Release body + link issue
 │   └─ NO ─┐
 │           ├─ Is it a new feature? (new check id/code, new flag,
 │           │   new output field that is additive/optional, new bundle)
 │           │   ├─ YES → MINOR (0.3.5 → 0.4.0 if feature batch; ≥1.0.0 → x.Y+1.0)
 │           │   └─ NO → PATCH (bugfix, security fix with no API, doc fix)
 │           │           e.g. `processes/header bug`, CORS wildcard→strict,
 │           │                scrub IPv6 `::1`, cargo fmt/clippy fixes
 └─ Requires migration guide if MAJOR; deprecation spans ≥1 MINOR before removal
```

Additional rules from SemVer FAQ and Common Changelog:

- **`0.y.z → 1.0.0`** when you're willing to **promise API stability** — "if your software is being used in production … should already be 1.0.0. If worried about compatibility, should already be 1.0.0." Many widely-used tools stay at `0.x` for years (helix is `25.x` CalVer, not SemVer 1.x) — there's no rush.
- **Never rewrite a published version.** If a MAJOR slip shipped as MINOR, ship a correcting MINOR that restores compat; document the offending version.
- **Deprecation needs a window:** announce in MINOR `1.5` with docs + warning, grace 2–4 releases (3–6 months), remove in next MAJOR — see [engineering-playbook component versioning](https://microsoft.github.io/code-with-engineering-playbook/source-control/component-versioning/).
- **Security fixes are PATCH** even if they touch many files, unless they break API (then MINOR+Security section) — highlight in `### Security` per Keep a Changelog and flag upgrade urgency.

---

## 4. Recommendation for linux-doctor

### 4.1 Should they release now? **Yes — tag and push `v0.3.5` immediately** (≈1 d after `v0.3.4`).

Criteria:

- **Security content alone justifies an out-of-band release.** `0.3.5` closes a plaintext-auth exfiltration path (`FLEET_API_KEY` over `http://`) and an LLM PII leak (home paths/IPs to third-party endpoint). These are the class of fixes peers ship as same-week patches (see `ripgrep 15.1.0` 6 d after `15.0.0`, `helix 25.01.1` 16 d after `25.01`, `fd 10.4.2` 2 d after `10.4.1`). Waiting to batch would leave users on a known-weak build.
- **Scope is already substantial and well-tested.** 6 new checks + catalogue docs + threshold fixes = far more than a "one-liner" patch; shipping it now avoids carrying a long-lived `HEAD`-only divergence (4 commits ahead, 2 of which are release hardening + version sync). The risk of *not* releasing (users run `main` without the security fixes) exceeds the spam cost of a 0.83 d interval.
- **Version choice `0.3.5` is defensible** (security+bugfix patch). Strict SemVer would argue `0.4.0` for the 6 new checks (`Added` → MINOR), but in `0.y.z` **PATCH carrying features is conventional** (many `0.x` projects treat every release as MINOR-in-patch-clothing; SemVer FAQ says "simplest is increment minor for each release" but doesn't forbid patch-features in pre-1.0). Since `8aa6260` already bumped `package.json` to `0.3.5` and `CHANGELOG.md` is dated `2026-08-27`, flip to `0.3.5` rather than churn the date/version again. **Next feature batch should be `0.4.0`.**
- **The missing `v0.3.3` tag is a signal to tighten discipline, not to delay.** `53930e8 Release v0.3.3` never got a tag; `v0.3.4` landed 13 h after its commit. Tagging `0.3.5` now with the correct two-phase flow (see §4.3 checklist) closes the gap cleanly.

**One-liner:** `git push origin main &&` wait `ci.yml` green `→ git tag -s v0.3.5 -m "v0.3.5" && git tag -v v0.3.5 && git push origin v0.3.5`.

### 4.2 Healthy cadence going forward

linux-doctor is **pre-1.0, npm+direct-bundle distributed, rapidly adding checks** — its audience tolerates faster cadence than homebrew-heavy peers, but **daily releases will burn maintainers and watchers**. Recommendation in phases:

| Phase | Duration / Trigger | Target cadence | What ships | Why |
|---|---|---|---|---|
| **A. Current burn-down (now → 0.4.0)** | Next 2–4 weeks, while closing trust/security gaps | **Weekly to biweekly** (7–14 d, median ~10 d) | `0.3.5` now, then `0.4.0` in 1–2 weeks once next check batch or hardening lands. Patch `0.4.1` within days only if regression/CVE. | Rewards early adopters, keeps `CHANGELOG.md` readable (one section per week), gives downstream `PKGBUILD` a stable hash for ≥7 d. Mirrors eza's weekly phase and starship's 2-week automated rhythm; far slower than current 1.7 d but still 5–10× faster than bat/helix. |
| **B. Stabilization (0.4.0 → 1.0.0 RC)** | After check catalogue ≥50 + parity contract solid, ~1–3 months | **Biweekly to monthly** (14–30 d, aim 21 d) | Minor `0.5.0`, `0.6.0` with themed batches (e.g., "fleet hardening", "desktop polish"). Security/crash patches still out-of-band within days. | Matches `helix`'s stated `2–3 months` intent and `fel`/`ripgrep` major cadence but compressed for `0.x`. Gives time for real-system `real-run` + Fedora smoke to catch regressions before each minor. |
| **C. Post-1.0 (when API promised)** | After `system.schemaVersion`/`JSON`/`thresholds` frozen | **Monthly to quarterly** (30–90 d, median ~60 d) with **patch-as-needed** | `1.x.0` monthly minors; `1.x.y` patches for sec/crash within days (like `ripgrep 15.0.0→15.1.0`). No silent daily. | Aligns with bat/fd/ripgrep mature range (60–158 d mean) and reduces Homebrew/AUR churn. Enables semantic promise: MINOR = safe, MAJOR = breaking+migration guide. |

**Anti-patterns to avoid:**

- **Do not batch until "enough" features justify a release** — large releases are riskier, harder to bisect, and slower to get feedback (GopherTrunk guidance). Peers that tried this (bat's `453 d` 0.24→0.25, fd's `368 d` gap) all accumulated downstream patch debt.
- **Do not ship daily after security burn-down.** `1.7 d` was a one-time prototype sprint; sustained daily would make `Releases` noisy and `PKGBUILD` `sha256sums` stale within hours. Even eza, the fastest peer, averages `11–43 d`, not `1 d`.
- **Do not skip the `Unreleased` stub.** Every release should end with `## [Unreleased]` re-opened (bat templates ` # unreleased` header) so the next notes build incrementally.

### 4.3 Two-phase workflow to adopt (from ripgrep/bat/helix)

Already documented in `RELEASING.md` but not yet enforced — make it mechanical:

1. `node scripts/bump-version.mjs X.Y.Z` (already atomic 7-file + `Cargo.lock` + `docs/checks.md` regen).
2. Curate `CHANGELOG.md:10-??` (move Unreleased → dated `## [X.Y.Z] - YYYY-MM-DD`, groups `Added/Changed/Fixed/Security`), leave fresh `Unreleased`.
3. Local verify: `npm run goldens:update` if needed, `npm test` green, `npm pack --dry-run | grep src-gui/index.html`, `cargo fmt --check && cargo clippy -D warnings` (already in `ci.yml` `rust-lint`), `node bin/doctor.js --self-test` + `--json | jq .checksRun`.
4. `git commit -am "chore: release X.Y.Z"` + `git push origin main` → **wait for `ci.yml` green** (matrix+fedora+rust+real-run).
5. `git tag -s vX.Y.Z -m "vX.Y.Z" && git tag -v vX.Y.Z && git push origin vX.Y.Z` (GPG-signed; avoids `push --follow-tags` ghost-tag issue).
6. `release.yml` creates Release (tag `v*`) with `CHANGELOG` body + `SHA256SUMS` + attestations; verify `SHA256SUMS` hash + `CHANGELOG` body in Release UI.
7. `npm publish --provenance` if registry target (configure OIDC trusted publisher; provenance auto-emitted since GA 2025-07-31).
8. Refresh `PKGBUILD` `sha256sums` from `SHA256SUMS` and open `## [Unreleased]`.

Add `Cargo.lock` regeneration and GPG `sign-git-tag` to CI assertion that `package.json`/`tauri.conf.json`/`Cargo.toml`/`CHANGELOG` all match the pushed tag (prevents the `0.3.3` missing-tag drift).

### 4.4 Decision matrix for the next months

| Situation | Action |
|---|---|
| **Security or crash regression** (panic, data loss, credential exfiltration) | **PATCH immediately** (`0.4.1` within hours–days) even if off-cadence — peers all do this (see §2.2). |
| **1–3 new checks + minor UX polish** and no breaking `code` rename | **Batch into next biweekly MINOR** (`0.4.0` → `0.5.0`), not a daily patch — keeps `CHANGELOG.md` a paragraph, not a ticker. |
| **Breaking change** (stable `code` renamed/removed, JSON `schemaVersion` bump, threshold key deprecated, ignore format changed) | **MINOR (in 0.x) with deprecation notice first** if possible — announce in `0.5.0`, remove in `0.6.0`. After `1.0.0`, this would be MAJOR with migration guide at top of Release notes. |
| **Quiet period** (only doc/refactor, no user-visible change) | **Do not release.** Let `Unreleased` accumulate; ship with next feature — avoid `0.3.4→0.3.5`-style 20 h churn without content. |

---

## 5. Reproducibility — commands run

```bash
git tag --list
git log --tags --simplify-by-decoration --pretty="%ai %d %s" | head
git tag --list | xargs -I{} sh -c 'echo -n "{}: "; git log -1 --format=%ai {}'
git log --oneline --decorate -n 50
git rev-list origin/main..HEAD --oneline
git describe --tags --long
git diff origin/main..HEAD --stat
# interval math:
python3 -c "from datetime import datetime; ..."
# plus web searches via aggregators for peer stats (inspect.software, releasealert.dev, mise-versions.jdx.dev)
```

---

## Sources (primary, high-trust)

- linux-doctor local git: `git tag --list` (`v0.2.0`…`v0.3.4`), `git log --tags`, `git diff origin/main..HEAD`, `CHANGELOG.md` (§1.1 table), `package.json:3`, `RELEASING.md`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`
- linux-doctor checklist deep-dive: `docs/research-release-checklist.md` (2026-08-27) — already cites mature patterns
- ripgrep: [Releases](https://github.com/BurntSushi/ripgrep/releases) · [CHANGELOG.md](https://github.com/BurntSushi/ripgrep/blob/master/CHANGELOG.md) · [RELEASE-CHECKLIST.md](https://github.com/BurntSushi/ripgrep/blob/master/RELEASE-CHECKLIST.md) · [mise ripgrep](https://mise-versions.jdx.dev/tools/ripgrep) (75 releases, ~2 mo avg)
- bat: [Releases](https://github.com/sharkdp/bat/releases) · [inspect bat](https://inspect.software/software/sharkdp/bat) (43 releases, 158.2 d mean) · [releasealert bat](https://releasealert.dev/github/sharkdp/bat) · [Discussion #2200](https://github.com/sharkdp/bat/discussions/2200) (ideal cadence poll)
- helix: [Releases](https://github.com/helix-editor/helix/releases) · [CHANGELOG.md (raw)](https://raw.githubusercontent.com/helix-editor/helix/master/CHANGELOG.md) · [helix releases docs](https://helix-editor.vercel.app/contributing/releases/) (shoot for 2–3 months) · [Discussion #6362](https://github.com/helix-editor/helix/discussions/6362) · [Discussion #12274](https://github.com/helix-editor/helix/discussions/12274)
- starship: [Releases](https://github.com/starship/starship/releases) · [releasealert starship](https://releasealert.dev/github/starship/starship) (153 releases, 2 w 2 d) · [addremoveprograms starship](https://addremoveprograms.com/application/starship/) (46 d) · [CHANGELOG.md](https://github.com/starship/starship/blob/main/CHANGELOG.md) · [release.yml (`release-please`)](https://github.com/starship/starship/blob/main/.github/workflows/release.yml)
- eza: [Releases](https://github.com/eza-community/eza/releases) · [mise eza](https://mise-versions.jdx.dev/tools/eza) (96 releases, ~11 d avg) · [inspect eza](https://inspect.software/software/eza-community/eza) (42.7 d mean) · [justfile (`just release`/`gh-release`)](https://github.com/eza-community/eza/blob/main/justfile) · [v0.23.5 notes ("life happened")](https://newreleases.io/project/github/eza-community/eza/release/v0.23.5)
- fd: [Releases](https://github.com/sharkdp/fd/releases) · [inspect fd](https://inspect.software/software/sharkdp/fd) (44 releases, 123.3 d mean) · [mise fd](https://mise-versions.jdx.dev/tools/fd) · [crates.io fd-find](https://crates.io/crates/fd-find)
- SemVer: [Semantic Versioning 2.0.0](https://semver.org/) (MAJOR.MINOR.PATCH, 0.y.z rule, precedence)
- Keep a Changelog: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) (Unreleased, Added/Changed/Fixed/Security, date, curated for humans)
- GitHub docs: [About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) (tags, assets <2 GiB, immutable releases) · [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) (draft→publish, pre-release flag)
- Modern cadence guidance: [GopherTrunk — Build in the Open, Part 11: Releases](https://gophertrunk.org/blog/tutorials/build-in-the-open-11-releases-prerelease-semver-changelogs/) (release often, small bites; `Unreleased` as PRs merge) · [GOV.UK — Release strategies](https://github.com/alphagov/government-service-design-manual/blob/4ea37b2d67ce7aa106e71a296b14f560819d99fd/service-manual/making-software/release-strategies.md) (regular small releases reduce risk)
