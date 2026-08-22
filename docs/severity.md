# Severity rubric

Every finding's severity is decided against this rubric — never per-case
intuition. The registry test (`tests/codes-registry.test.js`) pins every
built-in code to its allowed severity set; a change here must go together
with a manifest update and a CHANGELOG entry.

## The three levels

| Level | Question it answers | Typical findings |
|---|---|---|
| **High** | Is data loss, security exposure, or an unbootable/unusable system imminent? | `disk/full`, `fs/readonly-remount`, `smart/failing`, `ssh/root-password`, `crash/panic`, `hardware/mce` |
| **Medium** | Is the system actively degraded, or is a latent risk parked that becomes a real problem at the next incident? | `services/failed`, `memory/low`, `backup/none`-adjacent, `thermal/warm`, `updates/pending` (many), `gpu/nvidia-missing` |
| **Info** | Hygiene, context, or confirmation that a subsystem looks healthy | `zram/ok`, `wayland/x11`, `luks/encrypted`, `secureboot/enabled` |

Decision rules:

1. **Data loss / corruption risk → high.** Read-only remounts, SMART failing,
   full disks, filesystem errors.
2. **Security exposure → high** when a service is *directly reachable*
   (root SSH login allowed, password auth on root). **Medium** when exposure
   requires a hostile network position.
3. **Degradation without data risk → medium**, even when very annoying
   (software rendering, one process eating 40% of RAM). "Slow" is medium;
   "dying" or "unbootable" is high.
4. **Latent risk → medium**: timers that never run, backups missing, pending
   reboots, firmware updates waiting.
5. **Escalation by magnitude is allowed within one code** (e.g. `memory/low`
   is high under 15% available, medium under 25%) but must stay inside the
   code's pinned severity set in the registry.
6. **Healthy-state findings are always info** and only emitted when the check
   actually saw the underlying data (enforced by `tests/contract.test.js`).

## Documented exceptions

- `security/no-firewall` stays **info**: most desktop installs sit behind a
  NAT router and ship with firewalld off; penalizing the default install in
  the score would train users to ignore the score. The finding still explains
  the public-Wi-Fi risk. Revisit if a fleet/server profile ever diverges.

## Health-score weights

Severity feeds the score via `src/severities.js`: base penalties 15/8/0 with
within-tier escalation (`SEV_ESCALATION`). Changing a finding's severity
changes scores on user machines — treat it as a breaking-ish change:
CHANGELOG entry required, history keeps working (scores are recomputed per
run, never stored as deltas).

## Changing a code or its severity

1. Update the check and the manifest in `tests/codes-registry.test.js`.
2. Add a CHANGELOG entry under **Changed** (codes are identity: scripts and
   history diff by them).
3. Never rename a code without a migration story — old history entries keep
   the old code and will read as fixed+new once.
