/**
 * Where linux-doctor keeps its files, following the XDG Base Directory spec.
 * Every path honors its per-tool env override first (LINUX_DOCTOR_CONFIG,
 * LINUX_DOCTOR_HISTORY, LINUX_DOCTOR_PLUGINS, LINUX_DOCTOR_CACHE), then the
 * matching XDG_* variable, then the spec default under $HOME. All env and HOME
 * reads happen at call time so tests can redirect paths per run.
 */
import { homedir } from "node:os";
import { join } from "node:path";

const home = () => homedir() || ".";

const xdgBase = (name, fallback) => process.env[name] || join(home(), fallback);

/** ~/.config/linux-doctor/config.json */
export function configFile() {
  if (process.env.LINUX_DOCTOR_CONFIG) return process.env.LINUX_DOCTOR_CONFIG;
  return join(xdgBase("XDG_CONFIG_HOME", ".config"), "linux-doctor", "config.json");
}

/** ~/.local/share/linux-doctor/history.json */
export function historyFile() {
  if (process.env.LINUX_DOCTOR_HISTORY) return process.env.LINUX_DOCTOR_HISTORY;
  return join(xdgBase("XDG_DATA_HOME", join(".local", "share")), "linux-doctor", "history.json");
}

/** ~/.config/linux-doctor/checks/ — drop-in plugin checks */
export function pluginDir() {
  if (process.env.LINUX_DOCTOR_PLUGINS) return process.env.LINUX_DOCTOR_PLUGINS;
  return join(xdgBase("XDG_CONFIG_HOME", ".config"), "linux-doctor", "checks");
}

/** ~/.cache/linux-doctor/ — check result cache */
export function cacheDir() {
  if (process.env.LINUX_DOCTOR_CACHE) return process.env.LINUX_DOCTOR_CACHE;
  return join(xdgBase("XDG_CACHE_HOME", ".cache"), "linux-doctor");
}