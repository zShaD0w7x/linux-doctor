/**
 * The single source of truth for severity semantics: the fixed set of levels,
 * their display labels, the numeric weights used for dedupe tie-breaking, and
 * the health-score penalties. Every module that must reason about severity
 * (dedupe, scoring, counts, rendering) imports from here instead of hardcoding
 * its own copy.
 */
export const SEV_ORDER = ["high", "medium", "info"];

export const SEV_LABEL = {
  high: "🔴 HIGH",
  medium: "🟡 MEDIUM",
  info: "⚪ INFO",
};

/** Numeric weight per severity — higher wins on a dedupe conflict. */
export const SEV_WEIGHT = { high: 3, medium: 2, info: 1 };

/** Health-score penalty per finding of this severity (info is free). */
export const SEV_PENALTY = { high: 15, medium: 8, info: 0 };

/**
 * Escalation on top of SEV_PENALTY: problems compound, and the score should
 * say so. The n-th finding of a tier (n counted within that tier) costs
 * SEV_PENALTY + SEV_ESCALATION × max(0, n − (SEV_ESCALATE_FROM − 1)).
 *   high:   each additional critical beyond the first costs +5 more
 *           (15, 20, 25, 30 …) — four failed units must not land anywhere
 *           near a pile of annoyances.
 *   medium: the first three stay at the flat 8; from the fourth on each one
 *           costs +1 more (a growing pile of "minor" issues is itself a
 *             problem).
 * Without this, 4 high (40) and 7 medium (44) scored almost identically,
 * which read as "critical ≈ cosmetic".
 */
export const SEV_ESCALATION = { high: 5, medium: 1, info: 0 };

/** The finding ordinal within its tier where SEV_ESCALATION kicks in. */
export const SEV_ESCALATE_FROM = { high: 2, medium: 4, info: Number.POSITIVE_INFINITY };

/** [{ severity, count }] for every severity, in canonical order. */
export function countBySeverity(findings) {
  return SEV_ORDER.map((s) => ({ severity: s, count: findings.filter((f) => f.severity === s).length }));
}