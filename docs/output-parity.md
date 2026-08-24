# Output parity checklist

One message, four channels: the terminal report (`linux-doctor`), `--plain`,
`--json` (and therefore the dashboard + static HTML export, which consume the
same payload). Every user-visible state must render coherently in all of
them, with the same vocabulary and the same numbers.

Shared vocabulary (pinned by `tests/output-parity.test.js`, which greps BOTH
the CLI output and `src-gui/index.html`):

| Concept | CLI text | --plain | JSON | Dashboard |
|---|---|---|---|---|
| Since last run | `SINCE LAST RUN  N new · N fixed · N unchanged` | `# since:` / `# new:` / `# fixed:` | `newCount` / `fixedCount` / `unchanged` / `diffSinceLast` | chips NEW/FIXED + "Changes since last run" |
| Next action | `▶ START HERE   #n Title` | (not shown; use `--todo`) | `nextAction {code,severity,title,fix}` | ▶ START HERE banner (renders `nextAction` as-is) |
| Score breakdown | `SCORE  77/100 = 100 −15 disk/full …` (top-3 penalized, `+N more`) | `# score-breakdown:` (full list) | `scoreBreakdown[]` | sidebar "Why this score" bars (top-3 + `+N more`, same server data) |
| Score trend | `TREND ▄▅▆▇ …` | `# trend:` | (client draws from `/api/history`) | history charts |
| Clean streak | `✅ Everything is clean — N clean run(s) in a row` | first line | `cleanStreak` | ok-message + empty state |
| Skipped checks | `skipped as not applicable on this immutable system (…)` | `# skipped:` | `skippedChecks[]` | "Skipped checks" section |
| Failed checks | `⚠ N check(s) failed to run: ids` | `# failed:` | `checkErrors[]` | "Failed checks" section |
| Ignore hint | `N finding(s) hidden by your ignore patterns.` | `# ignored:` | `ignoredCount` | (hidden by design) |

## State matrix

| State | Verified by |
|---|---|
| Mixed findings (high+medium), skips, check errors | `output-parity.test.js` → parity + vocabulary tests; `tests/golden/` → `mixed` snapshots |
| Healthy with streak | `phase3.test.js` → healthy-state premium; `tests/golden/` → `healthy-streak` |
| Healthy first run (no history) | `phase3.test.js` (plain-win phrasing); `tests/golden/` → `first-run` |
| Info-only system | `phase3.test.js` ("informational notes below"); `tests/golden/` → `info-only` |
| First run ever (empty history file) | `history.test.js` + `cli.test.js` delta test |
| `--no-history` / subset run (`--check`) | `history.test.js` (`isHistoryDisabled`), neutral diff asserted |
| Atomic/immutable system | `atomic.test.js` (+ `skippedChecks` in schema) |
| Corrupted history file | `history.test.js` (repair-on-read) |
| v1 → v2 history upgrade | `history.test.js` (upgrade bridge) |

Full-output regression net: every state above marked with a golden has
committed snapshots for pretty/plain/json in `tests/golden/snapshots/`,
compared byte-for-byte by `goldens.test.js`. Regenerate ONLY via
`npm run goldens:update`, then review the git diff as the record of the
intentional output change.

## Schema versioning policy

`linux-doctor --schema` documents the `--json` payload (schemaVersion 1).
The contract closes both ways, enforced by `tests/output-drift.test.js`
which runs the real binary and compares emitted keys against
`src/schema.js`:

- **Every** top-level key (and the nested `system` / `diffSinceLast` /
  finding / scoreBreakdown objects) must be documented in the schema — an
  undocumented field fails CI.
- **Additive changes are free**: new optional properties do not bump
  schemaVersion. Consumers must ignore unknown properties.
- Removing, renaming, retyping, or making a previously-emitted field
  required is incompatible: bump schemaVersion and update the schema in the
  same change.

## Deliberate single-channel notes

- **`--interactive`** is a text UI over the same report — it intentionally
  reuses the terminal channel's content instead of duplicating the
  vocabulary contract.
- **`--html`** embeds the exact `--json` payload (`window.__DATA__`), so it
  inherits JSON parity by construction — whatever `--json` says, the static
  report says.
- **Dashboard score-breakdown display** lives in the sidebar's "Why this
  score" block: top-3 penalized findings as proportional bars (+`+N more`),
  rendered from the payload's `scoreBreakdown` — same rule as `nextAction`,
  the client displays server data instead of recomputing penalties.

Rules that keep the matrix green when adding features:

1. Compute once (`attachHistory`), render everywhere — never re-derive diff
   or score per channel.
2. New user-facing concepts must land in all four channels (or be documented
   here as deliberately single-channel) **and** in the vocabulary test.
3. The dashboard renders server-provided data (`nextAction`) instead of
   recomputing; client-side fallbacks exist only for older payloads.
