import { run } from "./utils.js";

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
 */
export async function detectProfile(exec = run) {
  const supplies = (await exec("ls /sys/class/power_supply/ 2>/dev/null")).stdout.split(/\s+/).filter(Boolean);

  let hasBattery = false;
  for (const s of supplies) {
    if (/^(AC|ADP)/i.test(s) || /hidpp|controller/i.test(s)) continue;
    const type = await exec(`cat /sys/class/power_supply/${s}/type 2>/dev/null`);
    if (type.ok && type.stdout.trim() === "Battery") {
      hasBattery = true;
      break;
    }
  }

  const session = await exec("loginctl list-sessions --no-legend 2>/dev/null | awk '$2==\"seat0\"{print $1}' | head -1");
  const hasSession = session.ok && session.stdout.trim() !== "";

  let kind = "desktop";
  if (hasBattery) kind = "laptop";
  else if (session.ok && !hasSession) kind = "server"; // loginctl present, confirmed headless

  return { kind, hasBattery, hasSession };
}
