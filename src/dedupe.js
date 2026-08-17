/**
 * Collapses findings that report the same root cause from different checks.
 *
 * Several checks can detect one underlying problem — software rendering is
 * reported by both the gpu and wayland checks, for example. Without this
 * step, a single problem shows up as multiple findings and is penalized
 * multiple times in the health score.
 *
 * Findings opt in by setting a `dedupeKey`. On conflict the higher severity
 * wins; on a tie the first finding in check order wins (the specialized
 * check is listed before the aggregator one in src/cli.js).
 */
const SEVERITY = { high: 3, medium: 2, info: 1 };

export function dedupe(findings) {
  const kept = [];
  const byKey = new Map();
  for (const f of findings) {
    if (!f.dedupeKey) {
      kept.push(f);
      continue;
    }
    const prev = byKey.get(f.dedupeKey);
    if (!prev || (SEVERITY[f.severity] ?? 0) > (SEVERITY[prev.severity] ?? 0)) {
      byKey.set(f.dedupeKey, f);
    }
  }
  return [...kept, ...byKey.values()];
}
