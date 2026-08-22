/**
 * Premium (Pro) checks. Not part of the free registry: they are only merged
 * into the run when a valid Pro license key is configured (see src/license.js),
 * so the free version never executes them and never lists them.
 */
import { hardening } from "./hardening.js";
import { scrub } from "./scrub.js";
import { boottime } from "./boottime.js";
import { connets } from "./connets.js";
import { journalcap } from "./journalcap.js";

export const PRO_CHECKS = [hardening, scrub, boottime, connets, journalcap];