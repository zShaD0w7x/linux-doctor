# Compatibility and versioning

What you can rely on across versions, what is free to change, and how changes
are announced. Written before 1.0 on purpose: the moment to fix a promise is
while `0.x` still allows it.

## The public surface

A change here is **breaking** and needs a major version (or, before 1.0, a
CHANGELOG entry that says so):

| Surface | What it is | Where it is defined |
|---|---|---|
| CLI flags | names, arguments, semantics | [docs/cli.md](cli.md), `--help` |
| Exit codes | `0` nothing serious, `1` high/medium findings, `2` errors | [docs/cli.md](cli.md) |
| JSON report | `schemaVersion: 1`, top-level keys, types | `--schema`, `src/schema.js` |
| Finding codes | the stable identity (`disk/full`, `fs/btrfs-errors`) | [docs/checks.md](checks.md), pinned by `tests/codes-registry.test.js` |
| Config file | documented keys in `~/.config/linux-doctor/config.json` (ignore list, thresholds) | [docs/configuration.md](configuration.md) |
| Threshold names | the keys accepted by the config and `--thresholds-set` | [docs/configuration.md](configuration.md) |
| Check (plugin) shape | `id`, `title`, `category`, `appliesTo`, `run(ctx)` and the finding fields | [docs/configuration.md](configuration.md#plugins-custom-checks) |
| Pro loader contract | `init(core) → { checks, licensing }` | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Support bundle | `kind: "support-bundle"`, `schemaVersion: 1` | [docs/integrations.md](integrations.md) |

**Finding codes deserve their own sentence.** They are what `--ignore-code`,
the history diff (`new` / `fixed`) and the dashboard's saved state key on. A
renamed code silently breaks a user's ignore list and marks an old problem as
new again, so a rename is a breaking change even though it looks cosmetic.

### The JSON report

The schema ships with the tool (`linux-doctor --schema`) and its policy is
already enforced in code (`src/schema.js`):

- **Additive changes do not bump `schemaVersion`.** New optional properties are
  fine; consumers must ignore unknown properties.
- **Adding a required property, removing one, or narrowing a type** bumps the
  version and updates the schema document in the same change.
- Every emitted top-level key stays documented, and
  `tests/output-drift.test.js` fails when the report and the schema disagree.

## What is internal

No promise is made about these, in any release:

- anything under `src/` that is not listed above (module layout, helper names);
- the wording of `detail`, `fix` and `evidence` (they are prose, and improve
  over time);
- the layout and ordering of the terminal report, and `--help` text;
- run durations, `--profile` numbers, and anything in `--debug` output;
- the check list itself: checks are added, and a check may change its
  thresholds as evidence accumulates.

## Versioning

- **`0.x` (today).** Anything may change, as SemVer allows. Breaking changes
  are still called out in the CHANGELOG under `Changed` or `Removed` with a
  one-line migration note, because a surprise is a bug even when it is allowed.
- **From `1.0`.** Semantic Versioning: patch = fixes, minor = additive,
  major = breaking with a migration note in the release.

## Deprecation

When something public has to go:

1. announce it in the CHANGELOG;
2. keep it working, with a one-line warning on stderr, for at least one minor
   release;
3. remove it only in a major (before 1.0, in a minor whose CHANGELOG entry says
   it is breaking).

This applies to flags, config keys, finding codes and schema fields alike.

## Release trains

- **Fixes ship when they are ready.** A wrong finding, a security issue or a
  crash is not held back for a cadence: a diagnostic that lies is worse than a
  version number that is a few days early. See the checklist in
  [RELEASING.md](RELEASING.md).
- **Features are batched** into minors, from the `[Unreleased]` section, on the
  order of weeks.
- **Majors are rare** and carry a migration section.

## What we will not do

- Rename a finding code because a prettier name exists.
- Add a required field to the JSON, or narrow a type, without bumping
  `schemaVersion`.
- Change a plugin's shape or the Pro loader contract in a patch.
- Treat "it is only `0.x`" as licence to break things quietly. The label is
  permission to move fast, not to surprise people.
