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

## Recording a machine fixture (optional)

CI already runs the engine against clean distro containers (`Baseline (*)` jobs).
What no container can represent is what real tools print on a real desktop or
laptop, and that is where false positives actually come from. If you can
reproduce a wrong finding — or just want your distro in the corpus — record a
fixture:

```bash
LINUX_DOCTOR_RECORD=tests/fixtures/<distro>-<version>.json node bin/doctor.js --no-history
gzip -9 tests/fixtures/<distro>-<version>.json
```

The recorder keeps every command the run executed, with its output, scrubbed:
hostname, username, IP addresses, home paths, MAC addresses, UUIDs, machine ids,
serial numbers and email addresses are replaced before anything is written (in
command strings too — the EFI variable `SecureBoot-<guid>` path is a real
example). Read the file once before committing: the scrubber is best effort and
`tests/fixtures-privacy.test.js` is a backstop, not a guarantee.

Then open the fixture and justify every high/medium code under `expected`. A
freshly recorded entry carries a `TODO: ...` reason, and `tests/fixtures.test.js`
fails until you either fix the check or say why a healthy machine really has that
finding. That is not a formality: it is the difference between a corpus that
catches lies and one that enshrines them.

## Pro (premium) checks

**They live in a private package, not here.** This repository is the Free
edition, and a guard test (`tests/open-core.test.js`) fails the suite if a
`src/checks/pro/` directory, key generation or signature verification ever
appears in it. That guard exists so users can trust this edition is complete
rather than crippled — please do not work around it.

The core loads the private package through one documented interface:

```js
init(core) → { checks, licensing }
```

So, for a contribution here:

- The loader contract is pinned by a fixture in `tests/open-core.test.js`. Keep
  it working; changing it breaks the private package.
- Premium checks are written in the maintainer's private repository, not as a PR
  here. If you have an idea for one, open an issue describing it instead.
- `defineCheck` carries the `premium` marker for those checks, but that is the
  core's side of the contract, not an invitation to add one in this tree.

## License & CLA (important)

Linux Doctor is **dual-licensed**:

1. **GPL-3.0-or-later** — for open-source use (see [LICENSE](LICENSE)).
2. **A commercial license** — for companies that need to use it inside
   proprietary products (see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)).

Pro keys are issued by the maintainer and verified inside the Pro package: the
verification code and the signing secret are deliberately not in this
repository. No premium code ships here, so the Free edition behaves identically
whether or not a key string is present — a key on its own unlocks nothing.

To keep the dual license possible, **by submitting a pull request you agree that
your contributions are offered under both licenses and that the maintainer may
relicense them as needed.** This is standard practice for dual-licensed
projects such as MySQL and Qt.
