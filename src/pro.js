/**
 * Optional Linux Doctor Pro module discovery.
 *
 * Pro is a separate, proprietary distribution — it is NOT part of this
 * repository (open-core). This loader is the ONLY bridge: it looks for an
 * installed Pro module and, when found, asks it to register itself against
 * the core primitives (dependency injection, so the private package never
 * imports core file paths).
 *
 * Discovery order:
 *   1. $LINUX_DOCTOR_PRO_MODULE — path to the module's entry file (handy for
 *      air-gapped installs and tests)
 *   2. "@linux-doctor/pro" — the installed npm package
 *
 * With neither present the run simply proceeds as the free edition; a missing
 * module is silent (that is the default state of the world), while an
 * explicitly-requested module that fails to load surfaces its error.
 */
import { run, lines, num, shq, journalLines, parseSize, fmtBytes, plural, TIMEOUT_MS } from "./utils.js";
import { defineCheck } from "./checks/define.js";
import { configuredKey } from "./config.js";
import { finding } from "./findings.js";

/** Primitives handed to the Pro module so it never imports core paths. */
export const CORE_API = {
  run,
  lines,
  num,
  shq,
  journalLines,
  parseSize,
  fmtBytes,
  plural,
  TIMEOUT_MS,
  defineCheck,
  finding,
  configuredKey,
};

const state = {
  loaded: false,
  checks: [],
  licensing: null,
  error: null,
};

/** Test hook: forget any previously loaded module. */
export function resetProState() {
  state.loaded = false;
  state.checks = [];
  state.licensing = null;
  state.error = null;
}

/** Read-only view of the loader state (used by src/license.js). */
export function proState() {
  return state;
}

/**
 * Attempt to load the Pro module (once per process). Never throws — a broken
 * or absent Pro install must degrade to the free edition, not break a run.
 */
export async function loadProModule() {
  if (state.loaded) return state;
  state.loaded = true;

  const explicit = process.env.LINUX_DOCTOR_PRO_MODULE;
  const spec = explicit || "@linux-doctor/pro";
  try {
    const mod = await import(spec);
    const api = typeof mod.init === "function" ? mod.init(CORE_API) : mod;
    if (!Array.isArray(api.checks)) throw new Error('Pro module must expose { checks } via init()');
    for (const c of api.checks) {
      if (!c || typeof c.id !== "string" || typeof c.run !== "function") {
        throw new Error(`Pro module exposed an invalid check: ${c && c.id}`);
      }
    }
    state.checks = api.checks;
    state.licensing = typeof api.licensing === "object" && api.licensing ? api.licensing : null;
  } catch (err) {
    // Absent module = the normal free-edition world: stay silent about it.
    // An explicitly configured path that fails IS worth reporting.
    if (explicit) state.error = `${err?.message || err} (LINUX_DOCTOR_PRO_MODULE=${explicit})`;
  }
  return state;
}
