/**
 * Ignore list. Users can tell Linux Doctor to stop reporting a finding they
 * have already dealt with (or that is a false positive on their setup) by
 * adding its title to `~/.config/linux-doctor/config.json`:
 *
 *   { "ignore": ["3 services failed to start", "SELinux is preventing"] }
 *
 * Matches are case-insensitive substring matches on the finding title, so a
 * short fragment like "fw-fanctrl" works too. Config is a bonus, never a
 * dependency: if the file cannot be read, nothing is ignored.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { configFile, loadConfig } from "./config.js";

export { configFile };

/** Load the ignore patterns from the config file. Never throws. */
export function loadIgnore(file = configFile()) {
  const config = loadConfig(file);
  if (Array.isArray(config.ignore)) {
    return config.ignore.filter((p) => typeof p === "string" && p.trim() !== "");
  }
  return [];
}

/** Load stable-code ignore patterns from the config file. Never throws. */
export function loadIgnoreCodes(file = configFile()) {
  const config = loadConfig(file);
  if (Array.isArray(config.ignoreCodes)) {
    return config.ignoreCodes.filter((p) => typeof p === "string" && p.trim() !== "");
  }
  return [];
}

/**
 * Add an ignore pattern to the config file, preserving any other keys (e.g.
 * thresholds). Never throws; returns success.
 */
export function addIgnore(pattern, file = configFile()) {
  try {
    if (typeof pattern !== "string" || pattern.trim() === "") return false;
    const config = loadConfig(file);
    const patterns = Array.isArray(config.ignore)
      ? config.ignore.filter((p) => typeof p === "string" && p.trim() !== "")
      : [];
    if (!patterns.includes(pattern)) patterns.push(pattern);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...config, ignore: patterns }, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/** Add a stable-code ignore pattern to the config file. */
export function addIgnoreCode(code, file = configFile()) {
  try {
    if (typeof code !== "string" || code.trim() === "") return false;
    const config = loadConfig(file);
    const codes = Array.isArray(config.ignoreCodes)
      ? config.ignoreCodes.filter((c) => typeof c === "string" && c.trim() !== "")
      : [];
    if (!codes.includes(code)) codes.push(code);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...config, ignoreCodes: codes }, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/** True if the finding code matches any code-ignore pattern (exact match). */
export function isCodeIgnored(code, codes) {
  if (!codes || codes.length === 0) return false;
  return codes.includes(code);
}

/** True if the finding title matches any ignore pattern (case-insensitive). */
export function isIgnored(title, patterns) {
  if (!patterns || patterns.length === 0) return false;
  const t = String(title || "").toLowerCase();
  return patterns.some((p) => t.includes(String(p).toLowerCase()));
}
