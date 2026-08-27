/**
 * Severity thresholds, tunable via the config file:
 *
 *   { "thresholds": { "diskFullPct": 90, "memLowRatio": 0.15, ... } }
 *
 * Every key is optional; unset keys keep the defaults. Checks read the
 * merged object from ctx.thresholds (built once per run in src/cli.js).
 */
export const DEFAULT_THRESHOLDS = {
  // disk.js — percent used at which a partition is flagged
  diskFullPct: 90,
  diskWarnPct: 80,
  // inodes.js — percent of inodes used at which a filesystem is flagged
  inodeFullPct: 90,
  inodeWarnPct: 80,
  // memory.js — available/total ratio below which memory pressure is flagged
  memLowRatio: 0.15,
  memWarnRatio: 0.25,
  // load.js — 1-minute load average divided by core count
  loadWarnRatio: 0.7,
  loadHighRatio: 1.0,
  loadCriticalRatio: 1.5,
  // thermal.js — hottest CPU thermal zone, in °C
  tempWarnC: 85,
  tempHotC: 95,
  // processes.js — single app RSS as a fraction of total RAM
  procWarnRatio: 0.2,
  procHighRatio: 0.4,
  // journald.js — journal size in bytes before it is flagged
  journalWarnBytes: 2 * 1024 ** 3,
  // containerdisk.js — container image storage in GB
  containerWarnGB: 20,
  containerHighGB: 50,
  // network.js — DNS resolution time in ms before it is flagged as slow
  dnsSlowMs: 500,
  // pro/demo.js — demo premium check (private, not in docs)
  demoWarn: 0.9,
};

/** Merge the user's thresholds (config.thresholds) over the defaults. */
export function loadThresholds(config) {
  const t = (config && config.thresholds) || {};
  if (typeof t !== "object" || Array.isArray(t)) return DEFAULT_THRESHOLDS;
  const out = { ...DEFAULT_THRESHOLDS };
  for (const k of Object.keys(DEFAULT_THRESHOLDS)) {
    if (!(k in t)) continue;
    const v = Number(t[k]);
    if (!Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out;
}
