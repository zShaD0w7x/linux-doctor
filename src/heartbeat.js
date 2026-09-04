/**
 * Pro dead-man's switch: after every completed run, ping a heartbeat URL
 * (Healthchecks.io, BetterStack, or any URL that alerts on silence). The
 * monitor that watches the watchers — if the timer is deleted, the box goes
 * offline, or the run itself breaks, the pings stop and the external service
 * raises through its own notification path.
 *
 * The ping is a bare GET with no body: unlike --alert/--push it carries no
 * findings, no hostname, no score — liveness only, so there is nothing
 * sensitive to leak. URL shape is validated with the same guard as --push
 * and --alert; a failed ping throws and the caller treats it as a warning,
 * never a changed exit code.
 */
import { validatePushUrl } from "./fleet.js";

/** GET the heartbeat URL. Throws on network or HTTP errors. */
export async function pingHeartbeat(url) {
  const err = validatePushUrl(url, {});
  if (err) throw new Error(err.replace(/^--push /, ""));
  const res = await fetch(url.trim(), {
    method: "GET",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`heartbeat endpoint responded ${res.status}`);
  return res;
}
