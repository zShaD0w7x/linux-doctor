/**
 * Pro licensing — public side.
 *
 * This repository is the FREE edition. Linux Doctor Pro ships as a separate,
 * proprietary add-on package ("@linux-doctor/pro", never published openly);
 * all key signing/verification lives THERE, where the signing secret can
 * actually be kept private. Here we only relay what the installed module
 * reports: without it, this is a fully-functional free product and the
 * premium features simply do not exist (not listed, not run, not gated
 * behind nag screens).
 */
import { loadProModule, proState } from "./pro.js";
import { configuredKey } from "./config.js";

export { configuredKey };

/**
 * True when an installed Pro module says the configured key unlocks it.
 * The module owns verification; with no module installed there is nothing
 * to unlock, by design.
 */
export function isPro() {
  return proInfo().active;
}

/**
 * Human-readable license status for `--license` and --self-test.
 * Synchronous on purpose: cli.js awaits loadProModule() once at startup,
 * after which this reflects the module's verdict (or its absence).
 */
export function proInfo() {
  if (!loadProModuleSynced()) {
    return {
      active: false,
      tier: null,
      sub: null,
      expiresAt: null,
      reason: "Linux Doctor Pro is not installed — it ships as a separate add-on (see README #tiers)",
    };
  }
  const key = configuredKey();
  if (!key) {
    return { active: false, tier: null, sub: null, expiresAt: null, reason: "no license key configured (set LINUX_DOCTOR_LICENSE or config.licenseKey)" };
  }
  try {
    return proState().licensing.info(key);
  } catch (err) {
    return { active: false, tier: null, sub: null, expiresAt: null, reason: `Pro module error: ${err?.message || err}` };
  }
}

// proState().loaded is true only after cli.js awaits loadProModule() at
// startup; direct imports of license.js before that see "not installed",
// which keeps this module synchronous for all callers.
function loadProModuleSynced() {
  const s = proState();
  return s.loaded && !!s.licensing;
}
