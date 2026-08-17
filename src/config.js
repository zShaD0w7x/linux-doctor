/**
 * Config file (~/.config/linux-doctor/config.json, override with
 * LINUX_DOCTOR_CONFIG). Shared by the ignore list and the threshold tuning;
 * loading is centralized here so no other module parses the file itself.
 * Config is a bonus, never a dependency: if the file cannot be read, the
 * defaults apply.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Path of the config file. */
export function configFile() {
  if (process.env.LINUX_DOCTOR_CONFIG) return process.env.LINUX_DOCTOR_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || join(process.env.HOME || ".", ".config");
  return join(base, "linux-doctor", "config.json");
}

/** Load the config file. Never throws; returns {} when missing or corrupt. */
export function loadConfig(file = configFile()) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    /* missing or corrupt config — defaults apply */
  }
  return {};
}
