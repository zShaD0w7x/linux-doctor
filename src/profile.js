import { run, shq } from "./utils.js";

/**
 * What kind of machine this is, so checks with an `appliesTo` list can be
 * skipped when they are irrelevant (e.g. battery checks on a desktop).
 *
 *   laptop — a real battery is present
 *   server — confirmed headless (loginctl exists but no graphical session)
 *   desktop — everything else (including non-systemd systems we cannot probe)
 *
 * Wireless-device batteries (Logitech receivers, game controllers) are
 * excluded so they never turn a desktop into a "laptop".
 *
 * The default (no-injection) call is memoized: the profile cannot change while
 * a process is running, and it costs a handful of subprocess spawns. Tests pass
 * a custom `exec`, which always bypasses the cache.
 */
let cachedProfile = null;

/**
 * Shell probe for the session id of a seat-backed (graphical) session.
 * Exported so wayland.js reuses it and so tests can run the real parsing
 * against fixtures. Never index a fixed column: `loginctl list-sessions`
 * has gained columns across systemd versions, and `$2=="seat0"` used to
 * read the UID — classifying every battery-less desktop as a headless
 * server and skipping all desktop checks.
 */
export const SESSION_PROBE = 'loginctl list-sessions --no-legend 2>/dev/null | grep -m1 -E "(^|[[:space:]])seat[0-9]+([[:space:]]|$)" | cut -d" " -f1';

/** Drop the memoized profile — mainly for tests that inject a real exec. */
export function resetProfileCache() {
  cachedProfile = null;
}

export async function detectProfile(exec = run) {
  if (exec === run) {
    cachedProfile ||= computeProfile(run);
    return cachedProfile;
  }
  return computeProfile(exec);
}

async function computeProfile(exec) {
  const supplies = (await exec("ls /sys/class/power_supply/ 2>/dev/null")).stdout.split(/\s+/).filter(Boolean);

  const realSupplies = supplies.filter((s) => !/^(AC|ADP)/i.test(s) && !/hidpp|controller/i.test(s));
  const types = await Promise.all(
    realSupplies.map(async (s) => ({ s, type: await exec(`cat ${shq(`/sys/class/power_supply/${s}/type`)} 2>/dev/null`) }))
  );
  const hasBattery = types.some(({ type }) => type.ok && type.stdout.trim() === "Battery");

  // Find a session whose SEAT is a seatN token (see SESSION_PROBE).
  const session = await exec(SESSION_PROBE);
  const hasSession = session.ok && session.stdout.trim() !== "";

  let kind = "desktop";
  if (hasBattery) kind = "laptop";
  else if (session.ok && !hasSession) kind = "server"; // loginctl present, confirmed headless

  return { kind, hasBattery, hasSession };
}
