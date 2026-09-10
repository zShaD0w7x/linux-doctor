/**
 * Config file (~/.config/linux-doctor/config.json, override with
 * LINUX_DOCTOR_CONFIG). Shared by the ignore list and the threshold tuning;
 * loading is centralized here so no other module parses the file itself.
 * Config is a bonus, never a dependency: if the file cannot be read, the
 * defaults apply.
 */
import { readFileSync } from "node:fs";

import { configFile } from "./paths.js";

export { configFile };

let warnedCorrupt = false;

/** Load the config file. Never throws; returns {} when missing or corrupt. */
export function loadConfig(file = configFile()) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return {}; // missing config — defaults apply, silently
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Corrupt config used to vanish into defaults without a word, taking the
    // user's ignore list, thresholds and license key with it. Say so once.
    if (!warnedCorrupt) {
      warnedCorrupt = true;
      console.error(`linux-doctor: ignoring corrupt config file (${file}) — fix or delete it`);
    }
    return {};
  }
}

/**
 * The configured Pro license key: env override wins, then the config file.
 * Lives here (not in license.js) so the optional Pro module can receive it
 * as part of the injected core API without an import cycle.
 */
export function configuredKey() {
  const cfg = loadConfig();
  return process.env.LINUX_DOCTOR_LICENSE || cfg.licenseKey || null;
}
