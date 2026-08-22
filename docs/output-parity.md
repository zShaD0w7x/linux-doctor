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
| Score trend | `TREND ▄▅▆▇ …` | `# trend:` | (client draws from `/api/history`) | history charts |
| Clean streak | `✅ Everything is clean — N clean run(s) in a row` | first line | `cleanStreak` | ok-message + empty state |
| Skipped checks | `skipped as not applicable on this immutable system (…)` | `# skipped:` | `skippedChecks[]` | "Skipped checks" section |
| Failed checks | `⚠ N check(s) failed to run: ids` | `# failed:` | `checkErrors[]` | "Failed checks" section |
| Ignore hint | `N finding(s) hidden by your ignore patterns.` | `# ignored:` | `ignoredCount` | (hidden by design) |

## State matrix

| State | Verified by |
|---|---|
| Mixed findings (high+medium), skips, check errors | `output-parity.test.js` → parity + vocabulary tests |
| Healthy with streak | `phase3.test.js` → healthy-state premium |
| Healthy first run (no history) | `phase3.test.js` (plain-win phrasing) |
| Info-only system | `phase3.test.js` ("informational notes below") |
| First run ever (empty history file) | `history.test.js` + `cli.test.js` delta test |
| `--no-history` / subset run (`--check`) | `history.test.js` (`isHistoryDisabled`), neutral diff asserted |
| Atomic/immutable system | `atomic.test.js` (+ `skippedChecks` in schema) |
| Corrupted history file | `history.test.js` (repair-on-read) |
| v1 → v2 history upgrade | `history.test.js` (upgrade bridge) |

Rules that keep the matrix green when adding features:

1. Compute once (`attachHistory`), render everywhere — never re-derive diff
   or score per channel.
2. New user-facing concepts must land in all four channels (or be documented
   here as deliberately single-channel) **and** in the vocabulary test.
3. The dashboard renders server-provided data (`nextAction`) instead of
   recomputing; client-side fallbacks exist only for older payloads.
