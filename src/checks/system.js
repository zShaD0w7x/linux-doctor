import { run, lines } from "../utils.js";
import { detectDistro } from "../distro.js";

export async function systemInfo() {
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

  return {
    osRelease,
    distro: `${osRelease.NAME || "Linux"} ${osRelease.VERSION_ID || ""}`.trim(),
    family: dist.family,
    imageBased: dist.imageBased,
    kernel: kernel.stdout.trim() || "unknown",
    uptime: `${hours}h ${minutes}m`,
    cores: nproc.stdout.trim() || "unknown",
    immutable,
  };
}

function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
