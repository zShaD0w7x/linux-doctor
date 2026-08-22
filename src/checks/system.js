import { run, lines, num } from "../utils.js";
import { detectDistro } from "../distro.js";

/** The system cannot change while the process runs, so memoize — systemInfo
 * spawns five subprocesses and is called several times per run. */
let cachedSystem = null;

/** Drop the memoized system info (tests that need fresh data). */
export function resetSystemInfoCache() {
  cachedSystem = null;
}

export async function systemInfo() {
  cachedSystem ||= computeSystemInfo();
  return cachedSystem;
}

async function computeSystemInfo() {
  const [os, kernel, uptime, nproc] = await Promise.all([
    run("cat /etc/os-release 2>/dev/null"),
    run("uname -r 2>/dev/null"),
    run("cat /proc/uptime 2>/dev/null"),
    run("nproc 2>/dev/null"),
  ]);

  const osRelease = {};
  for (const l of lines(os.stdout)) {
    const eq = l.indexOf("=");
    if (eq > 0) {
      osRelease[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^"|"$/g, "");
    }
  }

  const uptimeSec = num(uptime.stdout.split(/\s+/)[0]);
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);

  // Immutable (ostree/composefs) distros report the root as a virtual layer.
  const rootFs = await run(`findmnt -no FSTYPE -T / 2>/dev/null`);
  const immutable = /composefs|ostree/i.test(rootFs.stdout || "");

  // Normalized distro profile (family, package manager, image-based) so
  // checks and JSON consumers have one place to learn what system this is.
  const dist = detectDistro(osRelease);

  // bootc is the newer atomic engine (CentOS/Fedora bootc, RHEL bootc). It
  // presents like ostree: a virtual root and image-based updates. Detect it
  // cheaply via the runtime state dir or the bootc binary.
  const bootcRes = await run("test -d /run/bootc 2>/dev/null || command -v bootc >/dev/null 2>&1 && echo 1");
  const bootc = bootcRes.ok && /1/.test(bootcRes.stdout);

  // One structured view of "is this an atomic system and what kind", so
  // checks and the report can adapt once instead of each re-deriving it.
  // The top-level `immutable`/`imageBased` booleans are kept for schema
  // compatibility — they are just mirrors of this object.
  const atomic = {
    immutable,
    imageBased: dist.imageBased,
    bootc,
    variant: dist.atomicVariant,
    pkg: dist.pkg,
  };

  return {
    osRelease,
    distro: `${osRelease.NAME || "Linux"} ${osRelease.VERSION_ID || ""}`.trim(),
    family: dist.family,
    imageBased: dist.imageBased,
    atomicVariant: dist.atomicVariant,
    kernel: kernel.stdout.trim() || "unknown",
    uptime: `${hours}h ${minutes}m`,
    cores: nproc.stdout.trim() || "unknown",
    immutable,
    atomic,
  };
}
