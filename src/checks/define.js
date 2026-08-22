/**
 * Standard metadata wrapper for checks. `category` groups checks in --list
 * output; `appliesTo` lists which kinds of systems the check is relevant for
 * (desktop | laptop | server — see src/profile.js). Checks without an
 * appliesTo run everywhere. `premium` marks Pro-only checks; they are only
 * registered (and thus only ever run) when a valid Pro license key is present.
 *
 * Run contract for authors:
 *  - Return findings built with finding() (src/findings.js) — never hand-written
 *    objects, so a missing or misspelled field fails loudly at construction.
 *  - Never claim health from missing data: when the data source failed or is
 *    unavailable, stay silent or emit an explicit `<id>/skipped` finding. An
 *    "ok / healthy / good" finding is only allowed when the check actually saw
 *    the underlying data (enforced by tests/contract.test.js).
 *
 * `skipOnAtomic` marks a check that is meaningless on an immutable/atomic
 * system (Bazzite, Silverblue, rpm-ostree, bootc) — its conclusions would be
 * false positives there. The runner skips it centrally (instead of each check
 * re-deriving `ctx.dist.imageBased`) and records a `skippedChecks` entry with
 * `atomicReason`, so the skip is visible in the report and JSON rather than
 * silently yielding zero findings.
 */
export const ALL_KINDS = ["desktop", "laptop", "server"];

export function defineCheck({ id, title, category = "system", appliesTo = ALL_KINDS, premium = false, skipOnAtomic = false, atomicReason = "", run }) {
  return { id, title, category, appliesTo, premium, skipOnAtomic, atomicReason, run };
}
