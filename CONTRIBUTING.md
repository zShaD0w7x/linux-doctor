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

1. Create `src/checks/<id>.js` exporting `{ id, title, run(ctx) }`.
   `ctx.run(cmd)` runs a read-only command; return `{ severity, title, detail,
   evidence, fix, confidence }` findings (severity: `high` | `medium` | `info`).
2. Register it in the `CHECKS` list in `src/cli.js`.
3. Add a test in `tests/checks.test.js` using `stubCtx` — never run real
   system commands in tests.
4. Run `npm test`, update the README checks table if needed.

## License & CLA (important)

Linux Doctor is **dual-licensed**:

1. **GPL-3.0-or-later** — for open-source use (see [LICENSE](LICENSE)).
2. **A commercial license** — for companies that need to use it inside
   proprietary products (see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)).

To keep this possible, **by submitting a pull request you agree that your
contributions are offered under both licenses and that the maintainer may
relicense them as needed.** This is standard practice for dual-licensed
projects such as MySQL and Qt.
