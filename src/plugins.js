/**
 * Plugin checks: any .js file in the plugin directory is loaded as a check.
 * This lets sysadmins add checks without forking the project — the killer
 * feature for custom environments. A plugin file must export (default or
 * named) an object shaped like a built-in check: { id, title, category?,
 * appliesTo?, async run(ctx) }.
 *
 * The directory is `~/.config/linux-doctor/checks/` (override with
 * LINUX_DOCTOR_PLUGINS). A broken plugin is reported to stderr and skipped —
 * it must never take down a run.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ALL_KINDS } from "./checks/define.js";
import { pluginDir } from "./paths.js";

export { pluginDir };

/** Load every plugin in the directory. Never throws. */
export async function loadPlugins(dir = pluginDir()) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  } catch {
    return []; // no plugin directory — nothing to load
  }

  const checks = [];
  for (const f of files.sort()) {
    try {
      const mod = await import(pathToFileURL(join(dir, f)).href);
      const check = mod.default ?? Object.values(mod)[0];
      if (check && typeof check.id === "string" && check.id.trim() !== "" && typeof check.run === "function") {
        // Normalize to the defineCheck shape so downstream code (gating,
        // --list) can assume category and appliesTo always exist.
        checks.push({
          ...check,
          category: check.category ?? "custom",
          appliesTo: Array.isArray(check.appliesTo) ? check.appliesTo : ALL_KINDS,
        });
      } else {
        console.error(`linux-doctor: plugin ${f} does not export { id, run } — skipping`);
      }
    } catch (err) {
      console.error(`linux-doctor: could not load plugin ${f}: ${err.message}`);
    }
  }
  return checks;
}
