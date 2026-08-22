# Contributing

Thanks for considering a contribution to Linux Doctor! It's a small, focused
project — keep it that way.

## Setup

- Node.js ≥ 20. No runtime dependencies.
- Run the tests with `npm test` (`node --test`).

## Ground rules

- **Read-only, always.** Every check inspects the system and never modifies
  it. Fixes are suggestions, never actions.
- Plain English for real people. Explain the problem like a normal user
  would understand it, and always offer a concrete fix.
- No new dependencies without a strong reason. This project's zero-dependency
  story is a feature.

## Adding a check

1. Create `src/checks/<id>.js` exporting `export const <id> = defineCheck({...})`
   (see `src/checks/define.js`): `id`, `title`, `category` (system / software /
   security / network / updates / hardware / data), optional `appliesTo`
   (`desktop` | `laptop` | `server` — set it when the check only makes sense
   on some systems, e.g. `battery: ["laptop"]`), and `async run(ctx)`.
   `ctx.run(cmd)` runs a read-only command; `ctx.dist` is the normalized distro
   profile and `ctx.thresholds` the tunable thresholds. Return
   `{ severity, title, detail, evidence, fix, confidence }` findings
   (severity: `high` | `medium` | `info`).
2. Register it in `src/checks/index.js` (the registry; order there = `--list`
   order, so keep categories contiguous and specialized checks before
   aggregators).
3. Add a test in `tests/checks.test.js` using `stubCtx` — never run real
   system commands in tests.
4. Run `npm test`, update the README checks table if needed.

## Adding a Pro (premium) check

Premium checks live in `src/checks/pro/` and are gated behind the license key —
they must never run or even be listed in the free edition. Differences from a
free check:

1. Set `premium: true` in the `defineCheck` object (see `define.js`), so the
   CLI only merges it into the registry when a valid key is configured.
2. Register it in `src/checks/pro/index.js` (exported as `PRO_CHECKS`).
3. Test it in `tests/prochecks.test.js` with `stubCtx`, and assert the check
   is flagged `premium`.
4. Run `npm test`. The free-edition tests (`--list`, `--check-list`,
   `--check <id>`) guard that premium checks stay invisible without a key —
   a premium check that leaks into free output fails the suite on purpose.

## License & CLA (important)

Linux Doctor is **dual-licensed**:

1. **GPL-3.0-or-later** — for open-source use (see [LICENSE](LICENSE)).
2. **A commercial license** — for companies that need to use it inside
   proprietary products (see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)).

On top of that, the Pro license key (`--license-gen`, signed HMAC) unlocks
premium features already shipped in the repo. Pro keys are issued by the
maintainer; contributors never need one to work on the free edition.

To keep this possible, **by submitting a pull request you agree that your
contributions are offered under both licenses and that the maintainer may
relicense them as needed.** This is standard practice for dual-licensed
projects such as MySQL and Qt.
