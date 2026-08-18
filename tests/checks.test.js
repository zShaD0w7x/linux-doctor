import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memory } from "../src/checks/memory.js";
import { load } from "../src/checks/load.js";
import { disk } from "../src/checks/disk.js";
import { services } from "../src/checks/services.js";
import { timers } from "../src/checks/timers.js";
import { ntp } from "../src/checks/ntp.js";
import { journal } from "../src/checks/journal.js";
import { gpu } from "../src/checks/gpu.js";
import { updates } from "../src/checks/updates.js";
import { security } from "../src/checks/security.js";
import { secureboot } from "../src/checks/secureboot.js";
import { firmware } from "../src/checks/firmware.js";
import { flatpak } from "../src/checks/flatpak.js";
import { thermal } from "../src/checks/thermal.js";
import { processes } from "../src/checks/processes.js";
import { suspend } from "../src/checks/suspend.js";
import { battery } from "../src/checks/battery.js";
import { bluetooth } from "../src/checks/bluetooth.js";
import { wayland } from "../src/checks/wayland.js";
import { backup } from "../src/checks/backup.js";
import { hardware } from "../src/checks/hardware.js";
import { smart } from "../src/checks/smart.js";
import { luks } from "../src/checks/luks.js";
import { audio } from "../src/checks/audio.js";
import { containers } from "../src/checks/containers.js";
import { network } from "../src/checks/network.js";
import { reboot, versionGt } from "../src/checks/reboot.js";
import { journald, parseSize } from "../src/checks/journald.js";
import { countBySeverity } from "../src/report.js";
import { detectDistro } from "../src/distro.js";
import { loadThresholds } from "../src/thresholds.js";

// The updates check caches its result; the existing tests exercise the
// command parsing, so disable the cache for this file's default env. The
// cache behavior itself is tested below with a dedicated temp directory.
const prevUpdatesTtl = process.env.LINUX_DOCTOR_UPDATES_TTL_MS;
process.env.LINUX_DOCTOR_UPDATES_TTL_MS = "0";
test.after(() => {
  if (prevUpdatesTtl === undefined) delete process.env.LINUX_DOCTOR_UPDATES_TTL_MS;
  else process.env.LINUX_DOCTOR_UPDATES_TTL_MS = prevUpdatesTtl;
});

/**
 * Build a stub ctx.run from a map of command → stdout string. The distro
 * profile comes from the given os-release (default: Bazzite, image-based)
 * and thresholds default to the shipped values.
 */
function stubCtx(map, osRelease = { id: "bazzite", id_like: "fedora" }) {
  return {
    osRelease,
    dist: detectDistro(osRelease),
    thresholds: loadThresholds({}),
    run: async (cmd) => {
      const entry = map[cmd];
      if (entry === undefined) return { ok: false, code: 1, stdout: "", stderr: "" };
      return { ok: true, code: 0, stdout: entry, stderr: "" };
    },
  };
}

test("memory: flags low available memory as high severity", async () => {
  const ctx = stubCtx({
    "free -b": `              total        used        free      shared  buff/cache   available\nMem:    16106127360 12884901888   500000000    500000000  4718592000   1500000000\nSwap:   8267812045 2362232012 5905580033`,
    "swapon --show --bytes": `NAME      TYPE      SIZE      USED      PRIO\n/dev/zram0 partition 8267812045 2362232012  100`,
  });
  const findings = await memory.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /low on usable memory/i);
  assert.ok(findings[0].fix, "high-severity findings should include a fix");
});

test("memory: healthy system produces no finding", async () => {
  const ctx = stubCtx({
    "free -b": `              total        used        free      shared  buff/cache   available\nMem:    16106127360  4000000000 1000000000  300000000  7000000000  11000000000\nSwap:   8267812045         0 8267812045`,
    "swapon --show --bytes": "",
  });
  const findings = await memory.run(ctx);
  assert.equal(findings.length, 0);
});

test("memory: configurable thresholds are honored", async () => {
  const ctx = stubCtx({
    "free -b": `              total        used        free      shared  buff/cache   available\nMem:    16106127360  4000000000 1000000000  300000000  7000000000  11000000000\nSwap:   8267812045         0 8267812045`,
    "swapon --show --bytes": "",
  });
  // 11/16 GB available ≈ 0.68 — normally fine; a raised warn ratio flags it.
  ctx.thresholds = { ...ctx.thresholds, memWarnRatio: 0.7 };
  const findings = await memory.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
});

test("load: overloaded CPU is flagged", async () => {
  const ctx = stubCtx({
    "cat /proc/loadavg": "8.50 6.00 4.00 2/300 1234",
    nproc: "4",
  });
  const findings = await load.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /overloaded/i);
});

test("disk: composefs (immutable) root is NOT reported as full", async () => {
  const ctx = stubCtx({
    "df -P -B1 --exclude-type=tmpfs --exclude-type=devtmpfs --exclude-type=squashfs --exclude-type=overlay --exclude-type=proc --exclude-type=sysfs --exclude-type=cgroup2": `Filesystem     1024-blocks        Used   Available Capacity Mounted on\ncomposefs      60000000    60000000          0    100% /\n/dev/sda3     957000000000 350000000000 600000000000   37% /var/home`,
  });
  const findings = await disk.run(ctx);
  assert.equal(findings.length, 0, "a full composefs root must be ignored");
});

test("disk: configurable thresholds are honored", async () => {
  const ctx = stubCtx({
    "df -P -B1 --exclude-type=tmpfs --exclude-type=devtmpfs --exclude-type=squashfs --exclude-type=overlay --exclude-type=proc --exclude-type=sysfs --exclude-type=cgroup2": `Filesystem     1024-blocks        Used   Available Capacity Mounted on\n/dev/sda1     100000000000  85000000000  15000000000    85% /data\n`,
  });
  ctx.thresholds = { ...ctx.thresholds, diskFullPct: 80 };
  const findings = await disk.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /nearly full/);
});

test("disk: a real partition at 95% is reported as high", async () => {
  const ctx = stubCtx({
    "df -P -B1 --exclude-type=tmpfs --exclude-type=devtmpfs --exclude-type=squashfs --exclude-type=overlay --exclude-type=proc --exclude-type=sysfs --exclude-type=cgroup2": `Filesystem     1024-blocks        Used   Available Capacity Mounted on\n/dev/sda1     100000000000  95000000000   5000000000    95% /data`,
  });
  const findings = await disk.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /nearly full/i);
});

test("services: failed units are surfaced", async () => {
  const ctx = stubCtx({
    "systemctl --failed --no-legend --plain": `homebrew.clamav.service loaded failed failed`,
    "systemctl --user --failed --no-legend --plain": "",
  });
  const findings = await services.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /homebrew\.clamav/i);
  assert.match(findings[0].fix, /systemctl status homebrew\.clamav/i);
});

test("journal: known noise is filtered into an informational finding", async () => {
  const ctx = stubCtx({
    "journalctl -p err --since \"-24 hours\" --no-pager -o short 2>/dev/null | grep -v \"^-- \"": `Aug 15 14:32:47 bazzite systemd-udevd[465]: /usr/lib/udev/rules.d/50-udev-default.rules:105 Failed to resolve group 'disk', ignoring: Unknown group\nAug 15 14:33:01 bazzite setroubleshoot[1807]: SELinux is preventing bootupctl from read access on the directory /proc.\nAug 15 14:36:58 bazzite cupsd[1512]: Returning IPP client-error-bad-request for Create-Printer-Subscriptions (ipp://localhost/) from localhost.`,
  });
  const findings = await journal.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /routine noise/i);
});

test("journal: system-sleep failures are deferred to the suspend check", async () => {
  const ctx = stubCtx({
    "journalctl -p err --since \"-24 hours\" --no-pager -o short 2>/dev/null | grep -v \"^-- \"": `Aug 15 15:49:09 bazzite (system-sleep)[11514]: /usr/lib/systemd/system-sleep/fw-fanctrl-suspend failed with exit status 1.`,
  });
  const findings = await journal.run(ctx);
  assert.equal(findings.length, 0, "the suspend check owns system-sleep failures");
});

test("journal: MCE lines are deferred to the hardware check", async () => {
  const ctx = stubCtx({
    "journalctl -p err --since \"-24 hours\" --no-pager -o short 2>/dev/null | grep -v \"^-- \"": `Aug 13 03:11:22 bazzite kernel: mce: [Hardware Error]: Machine check events logged`,
  });
  const findings = await journal.run(ctx);
  assert.equal(findings.length, 0, "the hardware check owns MCE lines");
});

test("gpu: NVIDIA present but no driver loaded → high", async () => {
  const ctx = stubCtx({
    "lspci -nn 2>/dev/null | grep -iE 'vga|3d|display'": "01:00.0 VGA compatible controller [0300]: NVIDIA Corporation GA106 [GeForce RTX 3060] [10de:2503]",
    "lsmod 2>/dev/null | awk '{print $1}' | grep -iE '^(nvidia|nouveau|amdgpu|i915|xe)$'": "",
    "ls /dev/dri/ 2>/dev/null": "card0\nrenderD128",
    "glxinfo -B 2>/dev/null | grep -i 'renderer string'": "",
  });
  const findings = await gpu.run(ctx);
  const high = findings.find((f) => f.severity === "high");
  assert.ok(high, "expected a high-severity finding");
  assert.match(high.title, /no driver is loaded/i);
});

test("gpu: NVIDIA with proprietary driver → info", async () => {
  const ctx = stubCtx({
    "lspci -nn 2>/dev/null | grep -iE 'vga|3d|display'": "01:00.0 VGA compatible controller [0300]: NVIDIA Corporation GA106 [10de:2503]",
    "lsmod 2>/dev/null | awk '{print $1}' | grep -iE '^(nvidia|nouveau|amdgpu|i915|xe)$'": "nvidia",
    "ls /dev/dri/ 2>/dev/null": "card0\nrenderD128",
    "glxinfo -B 2>/dev/null | grep -i 'renderer string'": "",
    "cat /proc/driver/nvidia/version 2>/dev/null": "NVRM version: NVIDIA UNIX x86_64 Kernel Module  570.124",
  });
  const findings = await gpu.run(ctx);
  const info = findings.find((f) => f.severity === "info");
  assert.ok(info);
  assert.match(info.title, /proprietary driver is loaded/i);
  assert.match(info.evidence, /570\.124/);
});

test("gpu: NVIDIA with nouveau → medium", async () => {
  const ctx = stubCtx({
    "lspci -nn 2>/dev/null | grep -iE 'vga|3d|display'": "01:00.0 VGA compatible controller [0300]: NVIDIA Corporation GA106 [10de:2503]",
    "lsmod 2>/dev/null | awk '{print $1}' | grep -iE '^(nvidia|nouveau|amdgpu|i915|xe)$'": "nouveau",
    "ls /dev/dri/ 2>/dev/null": "card0\nrenderD128",
    "glxinfo -B 2>/dev/null | grep -i 'renderer string'": "",
  });
  const findings = await gpu.run(ctx);
  const med = findings.find((f) => f.severity === "medium");
  assert.ok(med);
  assert.match(med.title, /nouveau/i);
});

test("gpu: AMD with amdgpu driver → info", async () => {
  const ctx = stubCtx({
    "lspci -nn 2>/dev/null | grep -iE 'vga|3d|display'": "06:00.0 VGA compatible controller [0300]: Advanced Micro Devices, Inc. [AMD/ATI] Navi 22 [Radeon RX 6700 XT]",
    "lsmod 2>/dev/null | awk '{print $1}' | grep -iE '^(nvidia|nouveau|amdgpu|i915|xe)$'": "amdgpu",
    "ls /dev/dri/ 2>/dev/null": "card0\nrenderD128",
    "glxinfo -B 2>/dev/null | grep -i 'renderer string'": "",
  });
  const findings = await gpu.run(ctx);
  const info = findings.find((f) => f.severity === "info");
  assert.ok(info);
  assert.match(info.title, /driver is working/i);
});

test("gpu: software rendering (llvmpipe) → high", async () => {
  const ctx = stubCtx({
    "lspci -nn 2>/dev/null | grep -iE 'vga|3d|display'": "00:02.0 VGA compatible controller [0300]: Intel Corporation UHD Graphics",
    "lsmod 2>/dev/null | awk '{print $1}' | grep -iE '^(nvidia|nouveau|amdgpu|i915|xe)$'": "i915",
    "ls /dev/dri/ 2>/dev/null": "card0\nrenderD128",
    "glxinfo -B 2>/dev/null | grep -i 'renderer string'": "renderer string: llvmpipe (LLVM 19.1.4, 256 bits)",
  });
  const findings = await gpu.run(ctx);
  const high = findings.find((f) => f.severity === "high");
  assert.ok(high, "software rendering must be flagged");
  assert.match(high.title, /software rendering/i);
});

test("countBySeverity buckets findings", () => {
  const counts = countBySeverity([
    { severity: "high" },
    { severity: "high" },
    { severity: "medium" },
    { severity: "info" },
  ]);
  assert.deepEqual(counts, [
    { severity: "high", count: 2 },
    { severity: "medium", count: 1 },
    { severity: "info", count: 1 },
  ]);
});

test("updates: apt counts pending updates correctly (grep -c output)", async () => {
  const ctx = stubCtx({
    "apt-get -s upgrade 2>/dev/null | grep -c '^Inst ' || true": "3\n",
  });
  ctx.osRelease = { id: "debian", id_like: "" };
  ctx.dist = detectDistro(ctx.osRelease);
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /3 update/i);
  assert.match(findings[0].fix, /apt upgrade/);
});

test("updates: dnf exit code 100 (updates available) is counted", async () => {
  const ctx = {
    osRelease: { id: "fedora", id_like: "fedora" },
    dist: detectDistro({ id: "fedora", id_like: "fedora" }),
    run: async (cmd) => {
      if (cmd.startsWith("dnf check-update")) {
        return { ok: false, code: 100, stdout: "kernel.x86_64 6.9.0-1 fedora\nfirefox.x86_64 130.0-1 fedora\n", stderr: "" };
      }
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /2 update/i);
});

test("updates: a failed check stays silent instead of claiming up to date", async () => {
  const ctx = {
    osRelease: { id: "debian", id_like: "" },
    dist: detectDistro({ id: "debian", id_like: "" }),
    run: async () => ({ ok: false, code: 100, stdout: "", stderr: "" }),
  };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 0);
});

test("updates: unknown distro family is skipped with info", async () => {
  const ctx = stubCtx({});
  ctx.osRelease = { id: "void", id_like: "" };
  ctx.dist = detectDistro(ctx.osRelease);
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /skipped/i);
});

test("updates: rpm-ostree (Bazzite) reports an available image update", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    run: async (cmd) => {
      if (cmd.startsWith("rpm-ostree upgrade --check")) {
        return { ok: true, code: 0, stdout: "Note: --check and --preview may be unreliable.\nAvailable update: 42.20260815.0 (checksum 1a2b3c)\n", stderr: "" };
      }
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /1 update/i);
  assert.match(findings[0].fix, /rpm-ostree upgrade/);
  assert.match(findings[0].fix, /Reboot/);
});

test("updates: rpm-ostree with no update available is up to date", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    run: async (cmd) => ({ ok: true, code: 0, stdout: "No updates available.\n", stderr: "" }),
  };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /up to date/i);
});

test("updates: openSUSE (zypper) counts pending updates", async () => {
  const ctx = {
    osRelease: { id: "opensuse-tumbleweed", id_like: "suse" },
    dist: detectDistro({ id: "opensuse-tumbleweed", id_like: "suse" }),
    run: async (cmd) => {
      if (cmd.startsWith("zypper -q lu")) {
        return { ok: true, code: 0, stdout: "4\n", stderr: "" };
      }
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /4 update/i);
  assert.match(findings[0].fix, /zypper update/);
});

test("updates: results are cached within the TTL (second run does not re-exec)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-updates-cache-"));
  const prevCache = process.env.LINUX_DOCTOR_CACHE;
  const prevTtl = process.env.LINUX_DOCTOR_UPDATES_TTL_MS;
  process.env.LINUX_DOCTOR_CACHE = dir;
  process.env.LINUX_DOCTOR_UPDATES_TTL_MS = "3600000";
  try {
    let calls = 0;
    const ctx = {
      osRelease: { id: "fedora", id_like: "fedora" },
      dist: detectDistro({ id: "fedora", id_like: "fedora" }),
      run: async (cmd) => {
        calls += 1;
        if (cmd.startsWith("dnf check-update")) {
          return { ok: false, code: 100, stdout: "firefox.x86_64 130.0-1 fedora\n", stderr: "" };
        }
        return { ok: false, code: 1, stdout: "", stderr: "" };
      },
    };
    const first = await updates.run(ctx);
    assert.match(first[0].title, /1 update/);
    assert.equal(calls, 1);
    const second = await updates.run(ctx);
    assert.match(second[0].title, /1 update/);
    assert.equal(calls, 1, "second run must come from the cache, not re-exec");
  } finally {
    if (prevCache === undefined) delete process.env.LINUX_DOCTOR_CACHE;
    else process.env.LINUX_DOCTOR_CACHE = prevCache;
    if (prevTtl === undefined) delete process.env.LINUX_DOCTOR_UPDATES_TTL_MS;
    else process.env.LINUX_DOCTOR_UPDATES_TTL_MS = prevTtl;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("updates: a failed check is not cached (next run retries)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-updates-cache-"));
  const prevCache = process.env.LINUX_DOCTOR_CACHE;
  const prevTtl = process.env.LINUX_DOCTOR_UPDATES_TTL_MS;
  process.env.LINUX_DOCTOR_CACHE = dir;
  process.env.LINUX_DOCTOR_UPDATES_TTL_MS = "3600000";
  try {
    let calls = 0;
    const ctx = {
      osRelease: { id: "fedora", id_like: "fedora" },
      dist: detectDistro({ id: "fedora", id_like: "fedora" }),
      run: async () => {
        calls += 1;
        return { ok: false, code: 1, stdout: "", stderr: "" };
      },
    };
    const first = await updates.run(ctx);
    assert.equal(first.length, 0);
    const second = await updates.run(ctx);
    assert.equal(second.length, 0);
    // A failed determination is not cached, so the second run re-executes
    // instead of serving a stale "up to date" from the cache.
    assert.equal(calls, 2);
  } finally {
    if (prevCache === undefined) delete process.env.LINUX_DOCTOR_CACHE;
    else process.env.LINUX_DOCTOR_CACHE = prevCache;
    if (prevTtl === undefined) delete process.env.LINUX_DOCTOR_UPDATES_TTL_MS;
    else process.env.LINUX_DOCTOR_UPDATES_TTL_MS = prevTtl;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("updates: Alpine (apk) counts upgradable packages", async () => {
  const ctx = {
    osRelease: { id: "alpine", id_like: "" },
    dist: detectDistro({ id: "alpine", id_like: "" }),
    run: async (cmd) => {
      if (cmd.startsWith("apk info -u")) {
        return { ok: true, code: 0, stdout: "musl\nopenssl\nbusybox\n", stderr: "" };
      }
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /3 update/i);
  assert.match(findings[0].fix, /apk upgrade/);
});

test("security: active firewall and SELinux enforcing are reported", async () => {
  const ctx = stubCtx({
    "systemctl is-active firewalld 2>/dev/null": "active\n",
    "systemctl is-active ufw 2>/dev/null": "inactive\n",
    "nft list ruleset 2>/dev/null | head -5": "",
    "getenforce 2>/dev/null": "Enforcing\n",
    "systemctl is-active packagekit 2>/dev/null || systemctl is-active dnf-makecache 2>/dev/null": "inactive\n",
  });
  const findings = await security.run(ctx);
  const titles = findings.map((f) => f.title).join(" ");
  assert.match(titles, /Firewall is active/);
  assert.match(titles, /SELinux is enforcing/);
  assert.ok(!findings.some((f) => f.severity === "medium"), "no medium finding when the firewall is up");
});

test("security: no firewall detected → medium finding", async () => {
  const ctx = stubCtx({
    "systemctl is-active firewalld 2>/dev/null": "inactive\n",
    "systemctl is-active ufw 2>/dev/null": "inactive\n",
    "nft list ruleset 2>/dev/null | head -5": "",
    "getenforce 2>/dev/null": "",
    "cat /sys/kernel/security/apparmor/profiles 2>/dev/null | head -3": "",
    "systemctl is-active packagekit 2>/dev/null || systemctl is-active dnf-makecache 2>/dev/null": "inactive\n",
  });
  const findings = await security.run(ctx);
  const med = findings.find((f) => f.severity === "medium");
  assert.ok(med, "expected a medium finding");
  assert.match(med.title, /No active firewall/);
});

test("security: AppArmor is reported on Debian-family systems", async () => {
  const ctx = stubCtx({
    "systemctl is-active firewalld 2>/dev/null": "active\n",
    "systemctl is-active ufw 2>/dev/null": "inactive\n",
    "nft list ruleset 2>/dev/null | head -5": "",
    "getenforce 2>/dev/null": "",
    "cat /sys/kernel/security/apparmor/profiles 2>/dev/null | head -3": "docker-default (enforce)\nsnap.discord.discord (enforce)\n",
    "systemctl is-active packagekit 2>/dev/null || systemctl is-active dnf-makecache 2>/dev/null": "inactive\n",
  });
  const findings = await security.run(ctx);
  const aa = findings.find((f) => f.title.includes("AppArmor"));
  assert.ok(aa, "expected an AppArmor finding");
  assert.equal(aa.severity, "info");
  assert.match(aa.evidence, /docker-default/);
});

test("processes: a single app over 20% of RAM is flagged medium", async () => {
  const ctx = stubCtx({
    // ps -o rss reports KiB: 4000000 KiB ≈ 3.8 GB of 15 GB (~25%).
    "ps -eo args=,rss --sort=-rss 2>/dev/null | head -8": `brave       4000000\nfirefox       800000\nplasma        500000\n`,
    "free -b": `              total        used        free      shared  buff/cache   available\nMem:    16106127360 12000000000   500000000    500000000  4718592000   1500000000\nSwap:   8267812045         0 8267812045`,
  });
  const findings = await processes.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /using a lot of memory/);
});

test("processes: a single app over 40% of RAM is flagged high", async () => {
  const ctx = stubCtx({
    // 8000000 KiB ≈ 7.6 GB of 15 GB (~50%).
    "ps -eo args=,rss --sort=-rss 2>/dev/null | head -8": `brave       8000000\nfirefox       800000\nplasma        500000\n`,
    "free -b": `              total        used        free      shared  buff/cache   available\nMem:    16106127360 14000000000   500000000    500000000  4718592000   1500000000\nSwap:   8267812045         0 8267812045`,
  });
  const findings = await processes.run(ctx);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /huge amount of memory/);
});

test("processes: healthy memory usage produces an info finding", async () => {
  const ctx = stubCtx({
    "ps -eo args=,rss --sort=-rss 2>/dev/null | head -8": `plasma        500000\nfirefox       400000\nbrave         300000\n`,
    "free -b": `              total        used        free      shared  buff/cache   available\nMem:    16106127360  5000000000 1000000000  300000000  7000000000  11000000000\nSwap:   8267812045         0 8267812045`,
  });
  const findings = await processes.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Top memory consumers/);
});

test("suspend: failing system-sleep hooks are surfaced as medium", async () => {
  const ctx = stubCtx({
    "journalctl -g \"system-sleep.*failed\" --since \"-7 days\" --no-pager -o short 2>/dev/null | grep -v \"^-- \"": `Aug 10 22:11:03 bazzite (system-sleep)[11514]: /usr/lib/systemd/system-sleep/fw-fanctrl-suspend failed with exit status 1.\nAug 11 07:30:12 bazzite (system-sleep)[11514]: /usr/lib/systemd/system-sleep/fw-fanctrl-suspend failed with exit status 1.`,
  });
  const findings = await suspend.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].evidence, /fw-fanctrl-suspend/);
});

test("suspend: clean log produces no finding", async () => {
  const ctx = stubCtx({
    "journalctl -g \"system-sleep.*failed\" --since \"-7 days\" --no-pager -o short 2>/dev/null | grep -v \"^-- \"": "",
  });
  const findings = await suspend.run(ctx);
  assert.equal(findings.length, 0);
});

test("suspend: boot separators alone are NOT a failing hook", async () => {
  // journalctl -g prints "-- Boot ... --" separators for every boot in the
  // window even when nothing matched — this used to produce a false positive.
  const ctx = stubCtx({
    "journalctl -g \"system-sleep.*failed\" --since \"-7 days\" --no-pager -o short 2>/dev/null | grep -v \"^-- \"": "",
  });
  const findings = await suspend.run(ctx);
  assert.equal(findings.length, 0, "separator-only output must not be a finding");
});

test("journal: boot separators do not inflate the error count", async () => {
  const ctx = stubCtx({
    "journalctl -p err --since \"-24 hours\" --no-pager -o short 2>/dev/null | grep -v \"^-- \"": `Aug 15 14:32:47 bazzite kernel: i2c i2c-1: Invalid 7-bit I2C address 0xffff`,
  });
  const findings = await journal.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /1 noteworthy error/);
  assert.ok(!findings[0].evidence.includes("-- Boot"), "no boot separators in evidence");
});

test("battery: low battery is flagged medium", async () => {
  const ctx = stubCtx({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\nBAT0\n",
    "cat /sys/class/power_supply/BAT0/type 2>/dev/null": "Battery\n",
    "cat /sys/class/power_supply/BAT0/capacity 2>/dev/null": "12\n",
    "cat /sys/class/power_supply/BAT0/status 2>/dev/null": "Discharging\n",
  });
  const findings = await battery.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /very low/);
});

test("battery: healthy battery is informational", async () => {
  const ctx = stubCtx({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\nBAT0\n",
    "cat /sys/class/power_supply/BAT0/type 2>/dev/null": "Battery\n",
    "cat /sys/class/power_supply/BAT0/capacity 2>/dev/null": "87\n",
    "cat /sys/class/power_supply/BAT0/status 2>/dev/null": "Charging\n",
  });
  const findings = await battery.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].detail, /87%/);
});

test("battery: desktop with no battery is skipped with info", async () => {
  const ctx = stubCtx({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\n",
  });
  const findings = await battery.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /No battery detected/);
});

test("services: non-systemd system explains why the check is skipped", async () => {
  const ctx = {
    osRelease: { id: "alpine", id_like: "" },
    run: async (cmd) => {
      if (cmd.startsWith("systemctl")) return { ok: false, code: -1, stdout: "", stderr: "", missing: true };
      if (cmd.startsWith("ps -p 1")) return { ok: true, code: 0, stdout: "openrc\n", stderr: "" };
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await services.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Non-systemd/);
  assert.match(findings[0].detail, /openrc/);
});

test("firmware: pending fwupd updates are reported as medium", async () => {
  const ctx = stubCtx({
    "command -v fwupdmgr 2>/dev/null": "/usr/bin/fwupdmgr\n",
    "systemctl is-active fwupd 2>/dev/null": "active\n",
    "fwupdmgr get-updates 2>/dev/null": "• System Firmware has updates: 1.2.3 → 1.2.4\n",
  });
  const findings = await firmware.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /1 firmware update/);
  assert.match(findings[0].fix, /fwupdmgr update/);
});

test("firmware: no pending updates is informational", async () => {
  const ctx = stubCtx({
    "command -v fwupdmgr 2>/dev/null": "/usr/bin/fwupdmgr\n",
    "systemctl is-active fwupd 2>/dev/null": "active\n",
    "fwupdmgr get-updates 2>/dev/null": "No updates available\n",
  });
  const findings = await firmware.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /up to date/i);
});

test("firmware: inactive daemon skips fwupdmgr and explains", async () => {
  const ran = [];
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    run: async (cmd) => {
      ran.push(cmd);
      if (cmd === "command -v fwupdmgr 2>/dev/null") return { ok: true, code: 0, stdout: "/usr/bin/fwupdmgr\n", stderr: "" };
      if (cmd === "systemctl is-active fwupd 2>/dev/null") return { ok: true, code: 0, stdout: "inactive\n", stderr: "" };
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await firmware.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /not checked/);
  assert.match(findings[0].fix, /enable --now fwupd/);
  assert.ok(!ran.some((c) => c.startsWith("fwupdmgr get-updates")), "fwupdmgr must not run when the daemon is inactive");
});

test("firmware: fwupd not installed stays silent", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    run: async (cmd) =>
      cmd.startsWith("fwupdmgr")
        ? { ok: false, code: -1, stdout: "", stderr: "", missing: true }
        : { ok: false, code: 1, stdout: "", stderr: "" },
  };
  const findings = await firmware.run(ctx);
  assert.equal(findings.length, 0);
});

test("secureboot: UEFI with Secure Boot enabled and TPM is informational", async () => {
  const ctx = stubCtx({
    "ls /sys/firmware/efi 2>/dev/null | head -1": "efi\n",
    "od -An -tu1 /sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c 2>/dev/null": "8 0 0 0 1\n",
    "mokutil --sb-state 2>/dev/null": "SecureBoot enabled\n",
    "ls /sys/class/tpm/tpm0 2>/dev/null": "tpm0\n",
  });
  const findings = await secureboot.run(ctx);
  const titles = findings.map((f) => f.title).join(" ");
  assert.match(titles, /Secure Boot is enabled/);
  assert.match(titles, /TPM is present/);
  assert.ok(!findings.some((f) => f.severity === "medium"));
});

test("secureboot: disabled Secure Boot and missing TPM are medium", async () => {
  const ctx = stubCtx({
    "ls /sys/firmware/efi 2>/dev/null | head -1": "efi\n",
    "mokutil --sb-state 2>/dev/null": "SecureBoot disabled\n",
  });
  const findings = await secureboot.run(ctx);
  const mediums = findings.filter((f) => f.severity === "medium");
  assert.equal(mediums.length, 2);
  assert.match(mediums.map((f) => f.title).join(" "), /Secure Boot is disabled/);
  assert.match(mediums.map((f) => f.title).join(" "), /No TPM detected/);
});

test("secureboot: legacy BIOS boot is informational", async () => {
  const ctx = stubCtx({});
  const findings = await secureboot.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Legacy BIOS/);
});

test("thermal: 95°C CPU is flagged high", async () => {
  const ctx = stubCtx({
    'for z in /sys/class/thermal/thermal_zone*; do [ -f "$z/type" ] && [ -f "$z/temp" ] && echo "$(cat "$z/type"):$(cat "$z/temp")"; done 2>/dev/null': "x86_pkg_temp:95000\nacpitz:51000\n",
  });
  const findings = await thermal.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /very hot/);
  assert.match(findings[0].evidence, /95°C/);
});

test("thermal: normal temperature is informational", async () => {
  const ctx = stubCtx({
    'for z in /sys/class/thermal/thermal_zone*; do [ -f "$z/type" ] && [ -f "$z/temp" ] && echo "$(cat "$z/type"):$(cat "$z/temp")"; done 2>/dev/null': "x86_pkg_temp:58000\n",
  });
  const findings = await thermal.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /look fine/);
});

test("thermal: throttling events in the journal are medium", async () => {
  const ctx = stubCtx({
    'journalctl -g "throttl" --since "-24 hours" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -3': "Aug 15 10:00:00 bazzite kernel: CPU3: Core temperature above threshold, cpu clock throttled\n",
  });
  const findings = await thermal.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /throttling/);
});

test("thermal: journalctl boot separators alone are NOT throttling", async () => {
  const ctx = stubCtx({
    'journalctl -g "throttl" --since "-24 hours" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -3': "",
  });
  const findings = await thermal.run(ctx);
  assert.ok(!findings.some((f) => f.title.includes("throttling")), "separator-only output must not be a throttling finding");
});

test("flatpak: pending updates are counted", async () => {
  const ctx = stubCtx({
    "flatpak remote-ls --updates 2>/dev/null": "app/org.mozilla.firefox/x86_64/stable\napp/org.gnome.Calculator/x86_64/stable\napp/org.videolan.VLC/x86_64/stable\n",
  });
  const findings = await flatpak.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /3 Flatpak update/);
  assert.match(findings[0].fix, /flatpak update/);
});

test("flatpak: up to date is informational", async () => {
  const ctx = stubCtx({
    "flatpak remote-ls --updates 2>/dev/null": "",
  });
  const findings = await flatpak.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /up to date/);
});

test("flatpak: not installed stays silent", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    run: async () => ({ ok: false, code: -1, stdout: "", stderr: "", missing: true }),
  };
  const findings = await flatpak.run(ctx);
  assert.equal(findings.length, 0);
});

test("bluetooth: no controller is informational and skips the rest", async () => {
  const ctx = stubCtx({
    "ls /sys/class/bluetooth 2>/dev/null": "",
  });
  const findings = await bluetooth.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /No Bluetooth hardware/);
});

test("bluetooth: controller + running daemon is healthy", async () => {
  const ctx = stubCtx({
    "ls /sys/class/bluetooth 2>/dev/null": "hci0\n",
    "systemctl is-failed bluetooth 2>/dev/null": "inactive\n",
    "pgrep -x bluetoothd 2>/dev/null": "1234\n",
  });
  const findings = await bluetooth.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Bluetooth is working/);
  assert.match(findings[0].evidence, /hci0/);
});

test("bluetooth: failed service is medium", async () => {
  const ctx = stubCtx({
    "ls /sys/class/bluetooth 2>/dev/null": "hci0\n",
    "systemctl is-failed bluetooth 2>/dev/null": "failed\n",
  });
  const findings = await bluetooth.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /failed state/);
  assert.ok(findings[0].fix, "failed services should include a fix");
});

test("bluetooth: controller present but daemon down is medium", async () => {
  const ctx = stubCtx({
    "ls /sys/class/bluetooth 2>/dev/null": "hci0\n",
    "systemctl is-failed bluetooth 2>/dev/null": "inactive\n",
    "pgrep -x bluetoothd 2>/dev/null": "",
  });
  const findings = await bluetooth.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /not running/);
  assert.match(findings[0].fix, /systemctl enable --now bluetooth/);
});

test("wayland: no graphical session is informational", async () => {
  const ctx = stubCtx({
    'loginctl list-sessions --no-legend 2>/dev/null | awk \'$2=="seat0"{print $1}\' | head -1': "",
  });
  const findings = await wayland.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /No graphical session/);
});

test("wayland: X11 session is informational", async () => {
  const ctx = stubCtx({
    'loginctl list-sessions --no-legend 2>/dev/null | awk \'$2=="seat0"{print $1}\' | head -1': "2\n",
    "loginctl show-session 2 -p Type -p Desktop 2>/dev/null": "Type=x11\nDesktop=KDE\n",
  });
  const findings = await wayland.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /X11 session/);
});

test("wayland: healthy Wayland session with running compositor is informational", async () => {
  const ctx = stubCtx({
    'loginctl list-sessions --no-legend 2>/dev/null | awk \'$2=="seat0"{print $1}\' | head -1': "3\n",
    "loginctl show-session 3 -p Type -p Desktop 2>/dev/null": "Type=wayland\nDesktop=gnome\n",
    "pgrep -a -f 'kwin_[w]ayland|gnome-[s]hell|[s]way|[h]yprland|[r]iver|[w]ayfire|[l]abwc|[n]iri|cosmic-[c]omp|[m]utter|[w]eston|[c]age' 2>/dev/null | head -1": "1234 gnome-shell\n",
  });
  const findings = await wayland.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Wayland session looks healthy/);
  assert.match(findings[0].evidence, /gnome-shell/);
});

test("wayland: Wayland session without a compositor is medium", async () => {
  const ctx = stubCtx({
    'loginctl list-sessions --no-legend 2>/dev/null | awk \'$2=="seat0"{print $1}\' | head -1': "3\n",
    "loginctl show-session 3 -p Type -p Desktop 2>/dev/null": "Type=wayland\nDesktop=gnome\n",
    "pgrep -a -f 'kwin_[w]ayland|gnome-[s]hell|[s]way|[h]yprland|[r]iver|[w]ayfire|[l]abwc|[n]iri|cosmic-[c]omp|[m]utter|[w]eston|[c]age' 2>/dev/null | head -1": "",
  });
  const findings = await wayland.run(ctx);
  const mediums = findings.filter((f) => f.severity === "medium");
  assert.equal(mediums.length, 1);
  assert.match(mediums[0].title, /no compositor process/);
});

test("wayland: software rendering in a Wayland session is high", async () => {
  const ctx = stubCtx({
    'loginctl list-sessions --no-legend 2>/dev/null | awk \'$2=="seat0"{print $1}\' | head -1': "3\n",
    "loginctl show-session 3 -p Type -p Desktop 2>/dev/null": "Type=wayland\nDesktop=hyprland\n",
    "pgrep -a -f 'kwin_[w]ayland|gnome-[s]hell|[s]way|[h]yprland|[r]iver|[w]ayfire|[l]abwc|[n]iri|cosmic-[c]omp|[m]utter|[w]eston|[c]age' 2>/dev/null | head -1": "42 Hyprland\n",
    "glxinfo -B 2>/dev/null | grep -i 'renderer string'": "OpenGL renderer string: llvmpipe (LLVM 17.0.6, 256 bits)\n",
  });
  const findings = await wayland.run(ctx);
  const high = findings.filter((f) => f.severity === "high");
  assert.equal(high.length, 1);
  assert.match(high[0].title, /software rendering/);
  assert.match(high[0].evidence, /llvmpipe/);
});

test("backup: nothing detected is medium", async () => {
  const ctx = stubCtx({
    'for t in borg restic rclone duplicity timeshift pika-backup backintime deja-dup; do command -v "$t" 2>/dev/null; done': "",
    "ls /etc/snapper/configs 2>/dev/null": "",
    "[ -f /etc/timeshift/timeshift.json ] && echo configured": "",
    "systemctl list-timers --all --no-pager 2>/dev/null | grep -iE 'backup|borg|restic|timeshift|snapper|pika|deja' | grep -oE '[A-Za-z0-9_.@-]+\\.timer' | sort -u": "",
  });
  const findings = await backup.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /No backup or snapshot tool/);
  assert.ok(findings[0].fix, "missing backups should include a fix");
});

test("backup: tools installed but nothing scheduled is medium", async () => {
  const ctx = stubCtx({
    'for t in borg restic rclone duplicity timeshift pika-backup backintime deja-dup; do command -v "$t" 2>/dev/null; done': "/usr/bin/borg\n/usr/bin/restic\n",
    "systemctl list-timers --all --no-pager 2>/dev/null | grep -iE 'backup|borg|restic|timeshift|snapper|pika|deja' | grep -oE '[A-Za-z0-9_.@-]+\\.timer' | sort -u": "",
  });
  const findings = await backup.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /nothing is scheduled/);
  assert.match(findings[0].evidence, /borg/);
});

test("backup: tools plus a scheduled timer is informational", async () => {
  const ctx = stubCtx({
    'for t in borg restic rclone duplicity timeshift pika-backup backintime deja-dup; do command -v "$t" 2>/dev/null; done': "/usr/bin/borg\n",
    "systemctl list-timers --all --no-pager 2>/dev/null | grep -iE 'backup|borg|restic|timeshift|snapper|pika|deja' | grep -oE '[A-Za-z0-9_.@-]+\\.timer' | sort -u": "borg-backup.timer\n",
  });
  const findings = await backup.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Backups are set up/);
  assert.match(findings[0].evidence, /borg-backup.timer/);
});

test("backup: snapper configs count as a snapshot system", async () => {
  const ctx = stubCtx({
    "ls /etc/snapper/configs 2>/dev/null": "home\nroot\n",
    "systemctl list-timers --all --no-pager 2>/dev/null | grep -iE 'backup|borg|restic|timeshift|snapper|pika|deja' | grep -oE '[A-Za-z0-9_.@-]+\\.timer' | sort -u": "snapper-timeline.timer\n",
  });
  const findings = await backup.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Backups are set up/);
  assert.match(findings[0].evidence, /snapper/);
});

test("hardware: machine check exceptions are high", async () => {
  const ctx = stubCtx({
    'journalctl -k -g "mce|machine check|hardware error" --since "-7 days" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -5': "Aug 13 03:11:22 bazzite kernel: mce: [Hardware Error]: Machine check events logged\n",
  });
  const findings = await hardware.run(ctx);
  const high = findings.filter((f) => f.severity === "high");
  assert.equal(high.length, 1);
  assert.match(high[0].title, /Machine check exceptions/);
  assert.ok(high[0].fix, "MCE findings should include a fix");
});

test("hardware: corrected ECC errors are medium", async () => {
  const ctx = stubCtx({
    'journalctl -k -g "edac|corrected error|ECC error" --since "-7 days" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -5': "Aug 14 09:41:05 bazzite kernel: EDAC mc0: UE row 2, channel-a 0\n",
  });
  const findings = await hardware.run(ctx);
  const med = findings.filter((f) => f.severity === "medium");
  assert.equal(med.length, 1);
  assert.match(med[0].title, /Corrected hardware errors/);
});

test("hardware: clean kernel log is informational", async () => {
  const ctx = stubCtx({
    'journalctl -k -g "mce|machine check|hardware error" --since "-7 days" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -5': "",
    'journalctl -k -g "edac|corrected error|ECC error" --since "-7 days" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -5': "",
  });
  const findings = await hardware.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /No hardware errors/);
});

test("hardware: boot separators alone are NOT hardware errors", async () => {
  // journalctl -k -g prints "-- Boot ... --" separators even with no matches.
  const ctx = stubCtx({
    'journalctl -k -g "mce|machine check|hardware error" --since "-7 days" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -5': "",
    'journalctl -k -g "edac|corrected error|ECC error" --since "-7 days" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -5': "",
  });
  const findings = await hardware.run(ctx);
  assert.ok(!findings.some((f) => f.severity === "high" || f.severity === "medium"), "separator-only output must not be an error finding");
});

test("luks: encrypted system is informational", async () => {
  const ctx = stubCtx({
    "lsblk -o NAME,FSTYPE,TYPE -n 2>/dev/null": "sda2 crypto_LUKS part\nluks-fedora crypto_LUKS crypt\n",
  });
  const findings = await luks.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /encryption is active/);
});

test("luks: unencrypted system is medium", async () => {
  const ctx = stubCtx({
    "lsblk -o NAME,FSTYPE,TYPE -n 2>/dev/null": "sda1 vfat part\nsda2 ext4 part\n",
  });
  const findings = await luks.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /No full-disk encryption/);
  assert.ok(findings[0].fix, "missing encryption should include a fix");
});

test("luks: no lsblk stays silent", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    run: async () => ({ ok: false, code: -1, stdout: "", stderr: "", missing: true }),
  };
  const findings = await luks.run(ctx);
  assert.equal(findings.length, 0);
});

test("network: no default route is medium", async () => {
  const ctx = stubCtx({
    "ip -brief addr show 2>/dev/null": "lo               UNKNOWN        127.0.0.1/8 ::1/128\nwlan0            UP             192.168.1.5/24\n",
    "ip route show default 2>/dev/null": "",
  });
  const findings = await network.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /No default network route/);
  assert.match(findings[0].detail, /wlan0/);
  assert.ok(findings[0].fix);
});

test("network: DNS failure is medium when a route exists", async () => {
  const ctx = stubCtx({
    "ip -brief addr show 2>/dev/null": "wlan0            UP             192.168.1.5/24\n",
    "ip route show default 2>/dev/null": "default via 192.168.1.1 dev wlan0 proto dhcp metric 600\n",
    "getent ahostsv4 kernel.org 2>/dev/null | head -1": "",
  });
  const findings = await network.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /DNS resolution is failing/);
  assert.ok(findings[0].fix);
});

test("network: route + working DNS is informational", async () => {
  const ctx = stubCtx({
    "ip -brief addr show 2>/dev/null": "wlan0            UP             192.168.1.5/24\n",
    "ip route show default 2>/dev/null": "default via 192.168.1.1 dev wlan0 proto dhcp metric 600\n",
    "getent ahostsv4 kernel.org 2>/dev/null | head -1": "151.101.1.69     STREAM kernel.org\n",
  });
  const findings = await network.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Network and DNS look healthy/);
});

test("network: missing iproute2 stays silent", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    run: async () => ({ ok: false, code: -1, stdout: "", stderr: "", missing: true }),
  };
  const findings = await network.run(ctx);
  assert.equal(findings.length, 0);
});

test("reboot: newer installed kernel than booted is medium", async () => {
  const ctx = stubCtx({
    "uname -r 2>/dev/null": "6.8.9-300.fc40.x86_64\n",
    "for f in /boot/vmlinuz-*; do readlink -f \"$f\"; done 2>/dev/null | sort -u | sed 's|.*/vmlinuz-||'": "6.8.9-300.fc40.x86_64\n6.9.12-200.fc40.x86_64\n",
    "[ -f /var/run/reboot-required ] && cat /var/run/reboot-required 2>/dev/null": "",
  }, { id: "fedora", id_like: "fedora" });
  const findings = await reboot.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /reboot is required/i);
  assert.match(findings[0].evidence, /6\.9\.12/);
  assert.ok(findings[0].fix);
});

test("reboot: /var/run/reboot-required alone is medium", async () => {
  const ctx = stubCtx({
    "uname -r 2>/dev/null": "6.8.9-300.fc40.x86_64\n",
    "for f in /boot/vmlinuz-*; do readlink -f \"$f\"; done 2>/dev/null | sort -u | sed 's|.*/vmlinuz-||'": "6.8.9-300.fc40.x86_64\n",
    "[ -f /var/run/reboot-required ] && cat /var/run/reboot-required 2>/dev/null": "*** System restart required ***\n",
  }, { id: "debian", id_like: "" });
  const findings = await reboot.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].detail, /reboot-required/);
});

test("reboot: newest kernel already booted is informational", async () => {
  const ctx = stubCtx({
    "uname -r 2>/dev/null": "6.9.12-200.fc40.x86_64\n",
    "for f in /boot/vmlinuz-*; do readlink -f \"$f\"; done 2>/dev/null | sort -u | sed 's|.*/vmlinuz-||'": "6.9.12-200.fc40.x86_64\n",
    "[ -f /var/run/reboot-required ] && cat /var/run/reboot-required 2>/dev/null": "",
  }, { id: "fedora", id_like: "fedora" });
  const findings = await reboot.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /No reboot needed/);
});

test("reboot: image-based (ostree) distros stay silent", async () => {
  const ctx = stubCtx({
    "uname -r 2>/dev/null": "6.8.9-300.fc40.x86_64\n",
  });
  const findings = await reboot.run(ctx);
  assert.equal(findings.length, 0);
});

test("reboot: versionGt compares kernel versions numerically", () => {
  assert.equal(versionGt("6.9.12-200.fc40.x86_64", "6.8.9-300.fc40.x86_64"), true);
  assert.equal(versionGt("6.8.9-300.fc40.x86_64", "6.9.12-200.fc40.x86_64"), false);
  assert.equal(versionGt("6.8.9", "6.8.9"), false);
  assert.equal(versionGt("6.1.0-28-amd64", "6.1.0-26-amd64"), true);
});

test("journald: large journal is medium", async () => {
  const ctx = stubCtx({
    "journalctl --disk-usage 2>/dev/null": "Archived and active journals take up 3.2G in the file system.\n",
  });
  const findings = await journald.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /journal is large/i);
  assert.match(findings[0].fix, /vacuum/);
});

test("journald: small journal is informational", async () => {
  const ctx = stubCtx({
    "journalctl --disk-usage 2>/dev/null": "Archived and active journals take up 18.2M in the file system.\n",
  });
  const findings = await journald.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Journal size is fine/);
});

test("journald: no systemd journal stays silent", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    run: async () => ({ ok: false, code: -1, stdout: "", stderr: "", missing: true }),
  };
  const findings = await journald.run(ctx);
  assert.equal(findings.length, 0);
});

test("journald: parseSize handles units", () => {
  assert.equal(parseSize("512.0M"), 512 * 1024 ** 2);
  assert.equal(parseSize("3.2G"), Math.round(3.2 * 1024 ** 3));
  assert.equal(parseSize("1024B"), 1024);
  assert.equal(parseSize("garbage"), 0);
});

test("smart: failing drive is high", async () => {
  const ctx = stubCtx({
    "smartctl --scan 2>/dev/null": "/dev/sda -d scsi # /dev/sda, SCSI device\n",
    "smartctl -H -c /dev/sda 2>/dev/null": "SMART overall-health self-assessment test result: FAILED!\n",
  });
  const findings = await smart.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /failing SMART health/);
  assert.ok(findings[0].fix);
});

test("smart: healthy drives are informational", async () => {
  const ctx = stubCtx({
    "smartctl --scan 2>/dev/null": "/dev/sda -d scsi # /dev/sda, SCSI device\n/dev/nvme0 -d nvme # /dev/nvme0, NVMe device\n",
    "smartctl -H -c /dev/sda 2>/dev/null": "SMART overall-health self-assessment test result: PASSED\n",
    "smartctl -H -c /dev/nvme0 2>/dev/null": "SMART overall-health self-assessment test result: PASSED\n",
  });
  const findings = await smart.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Disk health is good/);
  assert.match(findings[0].detail, /2 disk/);
});

test("smart: smartctl not installed stays silent", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    run: async () => ({ ok: false, code: -1, stdout: "", stderr: "", missing: true }),
  };
  const findings = await smart.run(ctx);
  assert.equal(findings.length, 0);
});

// systemd pads header and rows to the same fixed columns, so the parser
// slices by the header's column offsets. Rows are built with matching widths
// (short values glue to the next column with a single space, like real output).
const timerRow = (next, left, last, passed, unit, activates) =>
  [next.padEnd(34), left.padEnd(11), last.padEnd(34), passed.padEnd(12), unit.padEnd(28), activates].join("");
const TIMER_HEADER = timerRow("NEXT", "LEFT", "LAST", "PASSED", "UNIT", "ACTIVATES");

test("timers: an enabled timer that never fires is medium", async () => {
  const ctx = stubCtx({
    "systemctl list-timers --all --no-pager --plain 2>/dev/null":
      TIMER_HEADER + "\n" +
      timerRow("Mon 2026-08-18 19:00:00 EEST", "1h 30min left", "Mon 2026-08-18 08:00:00 EEST", "9h ago", "dnf-makecache.timer", "dnf-makecache.service") + "\n" +
      timerRow("-", "n/a", "-", "n/a", "borg-backup.timer", "borg-backup.service") + "\n\n2 timers listed.",
    "systemctl is-enabled borg-backup.timer 2>/dev/null": "enabled\n",
  });
  const findings = await timers.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /enabled but never running/);
  assert.match(findings[0].evidence, /borg-backup\.timer/);
  assert.ok(findings[0].fix);
});

test("timers: disabled timers showing '-' are NOT broken", async () => {
  const ctx = stubCtx({
    "systemctl list-timers --all --no-pager --plain 2>/dev/null":
      TIMER_HEADER + "\n" + timerRow("-", "n/a", "-", "n/a", "old-thing.timer", "old-thing.service") + "\n",
    "systemctl is-enabled old-thing.timer 2>/dev/null": "disabled\n",
  });
  const findings = await timers.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /healthy/);
});

test("timers: healthy timers are informational", async () => {
  const ctx = stubCtx({
    "systemctl list-timers --all --no-pager --plain 2>/dev/null":
      TIMER_HEADER + "\n" +
      timerRow("Mon 2026-08-18 19:00:00 EEST", "1h 30min left", "Mon 2026-08-18 08:00:00 EEST", "9h ago", "dnf-makecache.timer", "dnf-makecache.service") + "\n\n1 timers listed.",
  });
  const findings = await timers.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /healthy/);
});

test("timers: non-systemd stays silent", async () => {
  const ctx = {
    osRelease: { id: "alpine", id_like: "" },
    dist: detectDistro({ id: "alpine", id_like: "" }),
    thresholds: loadThresholds({}),
    run: async () => ({ ok: false, code: -1, stdout: "", stderr: "", missing: true }),
  };
  const findings = await timers.run(ctx);
  assert.equal(findings.length, 0);
});

test("ntp: synchronized clock is informational", async () => {
  const ctx = stubCtx({
    "timedatectl show -p NTPSynchronized 2>/dev/null": "NTPSynchronized=yes\n",
  });
  const findings = await ntp.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /synchronized/);
});

test("ntp: no NTP daemon is medium", async () => {
  const ctx = stubCtx({
    "timedatectl show -p NTPSynchronized 2>/dev/null": "NTPSynchronized=no\n",
    "systemctl is-active systemd-timesyncd chronyd ntpd 2>/dev/null || true": "inactive\ninactive\ninactive\n",
  });
  const findings = await ntp.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /not kept in sync/);
  assert.ok(findings[0].fix);
});

test("ntp: daemon active but unsynchronized is medium", async () => {
  const ctx = stubCtx({
    "timedatectl show -p NTPSynchronized 2>/dev/null": "NTPSynchronized=no\n",
    "systemctl is-active systemd-timesyncd chronyd ntpd 2>/dev/null || true": "active\n",
  });
  const findings = await ntp.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /not synchronized yet/);
});

test("ntp: no timedatectl stays silent", async () => {
  const ctx = {
    osRelease: { id: "alpine", id_like: "" },
    dist: detectDistro({ id: "alpine", id_like: "" }),
    thresholds: loadThresholds({}),
    run: async () => ({ ok: false, code: -1, stdout: "", stderr: "", missing: true }),
  };
  const findings = await ntp.run(ctx);
  assert.equal(findings.length, 0);
});

test("battery: heavy wear is medium", async () => {
  const ctx = stubCtx({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\nBAT0\n",
    "cat /sys/class/power_supply/BAT0/type 2>/dev/null": "Battery\n",
    "cat /sys/class/power_supply/BAT0/capacity 2>/dev/null": "60\n",
    "cat /sys/class/power_supply/BAT0/status 2>/dev/null": "Discharging\n",
    "cat /sys/class/power_supply/BAT0/charge_full 2>/dev/null": "3000000\n",
    "cat /sys/class/power_supply/BAT0/charge_full_design 2>/dev/null": "5000000\n",
  });
  const findings = await battery.run(ctx);
  const wear = findings.find((f) => /lost a lot of capacity/.test(f.title));
  assert.ok(wear, "expected a wear finding");
  assert.equal(wear.severity, "medium");
  assert.match(wear.evidence, /40% wear/);
});

test("battery: moderate wear is informational", async () => {
  const ctx = stubCtx({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\nBAT0\n",
    "cat /sys/class/power_supply/BAT0/type 2>/dev/null": "Battery\n",
    "cat /sys/class/power_supply/BAT0/capacity 2>/dev/null": "87\n",
    "cat /sys/class/power_supply/BAT0/status 2>/dev/null": "Charging\n",
    "cat /sys/class/power_supply/BAT0/charge_full 2>/dev/null": "4000000\n",
    "cat /sys/class/power_supply/BAT0/charge_full_design 2>/dev/null": "5000000\n",
  });
  const findings = await battery.run(ctx);
  const wear = findings.find((f) => /showing wear/.test(f.title));
  assert.ok(wear, "expected a wear info finding");
  assert.equal(wear.severity, "info");
});

test("battery: no wear data produces no wear finding", async () => {
  const ctx = stubCtx({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\nBAT0\n",
    "cat /sys/class/power_supply/BAT0/type 2>/dev/null": "Battery\n",
    "cat /sys/class/power_supply/BAT0/capacity 2>/dev/null": "87\n",
    "cat /sys/class/power_supply/BAT0/status 2>/dev/null": "Charging\n",
  });
  const findings = await battery.run(ctx);
  assert.equal(findings.length, 1, "only the status finding, no wear");
  assert.equal(findings[0].severity, "info");
});

test("smart: unreadable devices without root are explained, not silent", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    run: async (cmd) => {
      if (cmd === "smartctl --scan 2>/dev/null") return { ok: true, code: 0, stdout: "/dev/sda -d scsi # /dev/sda, SCSI device\n", stderr: "" };
      if (cmd.startsWith("smartctl -H -c")) return { ok: false, code: 4, stdout: "", stderr: "smartctl: Permission denied\n" };
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await smart.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /needs root/);
});

test("audio: no sound server running is a medium finding with a distro-aware fix", async () => {
  const ctx = {
    osRelease: { id: "fedora", id_like: "fedora" },
    dist: detectDistro({ id: "fedora", id_like: "fedora" }),
    thresholds: {},
    run: async () => ({ ok: true, code: 0, stdout: "down\n", stderr: "" }),
  };
  const findings = await audio.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /No sound server is running/);
  assert.match(findings[0].fix, /dnf install pipewire/);
});

test("audio: server up with a real sink is healthy; dummy sink is not", async () => {
  const makeCtx = (sinksOut) => ({
    osRelease: { id: "ubuntu", id_like: "debian" },
    dist: detectDistro({ id: "ubuntu", id_like: "debian" }),
    thresholds: {},
    run: async (cmd) => {
      if (cmd.includes("pgrep -x pipewire")) return { ok: true, code: 0, stdout: "up\n", stderr: "" };
      if (cmd.includes("command -v pactl")) return { ok: true, code: 0, stdout: "yes\n", stderr: "" };
      if (cmd.includes("pactl list sinks short")) return { ok: true, code: 0, stdout: sinksOut, stderr: "" };
      return { ok: true, code: 0, stdout: "down\n", stderr: "" };
    },
  });
  const healthy = await audio.run(makeCtx("0\talsa_output.pci-0000_00_1f.3.analog-stereo\tRUNNING\n"));
  assert.equal(healthy.length, 1);
  assert.match(healthy[0].title, /Audio is working/);
  assert.equal(healthy[0].severity, "info");

  const dummy = await audio.run(makeCtx("0\tauto_null\tRUNNING\n"));
  assert.equal(dummy.length, 1);
  assert.equal(dummy[0].severity, "medium");
  assert.match(dummy[0].title, /No audio output device detected/);
});

test("containers: no runtime installed is informational with an install hint", async () => {
  const ctx = {
    osRelease: { id: "debian", id_like: "" },
    dist: detectDistro({ id: "debian", id_like: "" }),
    thresholds: {},
    run: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
  };
  const findings = await containers.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /No container runtime installed/);
  assert.match(findings[0].fix, /apt install podman/);
});

test("containers: docker installed but daemon stopped is medium", async () => {
  const ctx = {
    osRelease: { id: "fedora", id_like: "fedora" },
    dist: detectDistro({ id: "fedora", id_like: "fedora" }),
    thresholds: {},
    run: async (cmd) => {
      if (cmd === "command -v podman 2>/dev/null") return { ok: false, code: 1, stdout: "", stderr: "" };
      if (cmd === "command -v docker 2>/dev/null") return { ok: true, code: 0, stdout: "/usr/bin/docker\n", stderr: "" };
      if (cmd.startsWith("systemctl is-active docker")) return { ok: true, code: 0, stdout: "inactive\n", stderr: "" };
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await containers.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].title, /Docker daemon is not running/);
  assert.match(findings[0].fix, /systemctl enable --now docker/);
});

test("containers: podman usable is reported healthy", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    thresholds: {},
    run: async (cmd) => {
      if (cmd === "command -v podman 2>/dev/null") return { ok: true, code: 0, stdout: "/usr/bin/podman\n", stderr: "" };
      if (cmd === "command -v docker 2>/dev/null") return { ok: false, code: 1, stdout: "", stderr: "" };
      if (cmd.startsWith("podman info")) return { ok: true, code: 0, stdout: "ok\n", stderr: "" };
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await containers.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /Container runtimes are ready/);
});
