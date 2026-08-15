import { test } from "node:test";
import assert from "node:assert/strict";
import { memory } from "../src/checks/memory.js";
import { load } from "../src/checks/load.js";
import { disk } from "../src/checks/disk.js";
import { services } from "../src/checks/services.js";
import { journal } from "../src/checks/journal.js";
import { gpu } from "../src/checks/gpu.js";
import { updates } from "../src/checks/updates.js";
import { security } from "../src/checks/security.js";
import { processes } from "../src/checks/processes.js";
import { suspend } from "../src/checks/suspend.js";
import { battery } from "../src/checks/battery.js";
import { countBySeverity } from "../src/report.js";

/** Build a stub ctx.run from a map of command → stdout string. */
function stubCtx(map) {
  return {
    osRelease: { id: "bazzite", id_like: "fedora" },
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
    "journalctl -p err --since \"-24 hours\" --no-pager -o short 2>/dev/null": `Aug 15 14:32:47 bazzite systemd-udevd[465]: /usr/lib/udev/rules.d/50-udev-default.rules:105 Failed to resolve group 'disk', ignoring: Unknown group\nAug 15 14:33:01 bazzite setroubleshoot[1807]: SELinux is preventing bootupctl from read access on the directory /proc.\nAug 15 14:36:58 bazzite cupsd[1512]: Returning IPP client-error-bad-request for Create-Printer-Subscriptions (ipp://localhost/) from localhost.`,
  });
  const findings = await journal.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /routine noise/i);
});

test("journal: a system-sleep failure is surfaced as meaningful", async () => {
  const ctx = stubCtx({
    "journalctl -p err --since \"-24 hours\" --no-pager -o short 2>/dev/null": `Aug 15 15:49:09 bazzite (system-sleep)[11514]: /usr/lib/systemd/system-sleep/fw-fanctrl-suspend failed with exit status 1.`,
  });
  const findings = await journal.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /fw-fanctrl-suspend|system-sleep/i);
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
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /3 update/i);
  assert.match(findings[0].fix, /apt upgrade/);
});

test("updates: dnf exit code 100 (updates available) is counted", async () => {
  const ctx = {
    osRelease: { id: "fedora", id_like: "fedora" },
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
    run: async () => ({ ok: false, code: 100, stdout: "", stderr: "" }),
  };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 0);
});

test("updates: unknown distro family is skipped with info", async () => {
  const ctx = stubCtx({});
  ctx.osRelease = { id: "void", id_like: "" };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /skipped/i);
});

test("updates: rpm-ostree (Bazzite) reports an available image update", async () => {
  const ctx = {
    osRelease: { id: "bazzite", id_like: "fedora" },
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
    run: async (cmd) => ({ ok: true, code: 0, stdout: "No updates available.\n", stderr: "" }),
  };
  const findings = await updates.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /up to date/i);
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
    "systemctl is-active packagekit 2>/dev/null || systemctl is-active dnf-makecache 2>/dev/null": "inactive\n",
  });
  const findings = await security.run(ctx);
  const med = findings.find((f) => f.severity === "medium");
  assert.ok(med, "expected a medium finding");
  assert.match(med.title, /No active firewall/);
});

test("processes: a single app over 20% of RAM is flagged medium", async () => {
  const ctx = stubCtx({
    // ps -o rss reports KiB: 4000000 KiB ≈ 3.8 GB of 15 GB (~25%).
    "ps -eo comm,rss --sort=-rss 2>/dev/null | head -8": `COMMAND          RSS\nbrave       4000000\nfirefox       800000\nplasma        500000\n`,
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
    "ps -eo comm,rss --sort=-rss 2>/dev/null | head -8": `COMMAND          RSS\nbrave       8000000\nfirefox       800000\nplasma        500000\n`,
    "free -b": `              total        used        free      shared  buff/cache   available\nMem:    16106127360 14000000000   500000000    500000000  4718592000   1500000000\nSwap:   8267812045         0 8267812045`,
  });
  const findings = await processes.run(ctx);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /huge amount of memory/);
});

test("processes: healthy memory usage produces an info finding", async () => {
  const ctx = stubCtx({
    "ps -eo comm,rss --sort=-rss 2>/dev/null | head -8": `COMMAND          RSS\nplasma        500000\nfirefox       400000\nbrave         300000\n`,
    "free -b": `              total        used        free      shared  buff/cache   available\nMem:    16106127360  5000000000 1000000000  300000000  7000000000  11000000000\nSwap:   8267812045         0 8267812045`,
  });
  const findings = await processes.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /Top memory consumers/);
});

test("suspend: failing system-sleep hooks are surfaced as medium", async () => {
  const ctx = stubCtx({
    "journalctl -g \"system-sleep.*failed\" --since \"-7 days\" --no-pager -o short 2>/dev/null": `Aug 10 22:11:03 bazzite (system-sleep)[11514]: /usr/lib/systemd/system-sleep/fw-fanctrl-suspend failed with exit status 1.\nAug 11 07:30:12 bazzite (system-sleep)[11514]: /usr/lib/systemd/system-sleep/fw-fanctrl-suspend failed with exit status 1.`,
  });
  const findings = await suspend.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].evidence, /fw-fanctrl-suspend/);
});

test("suspend: clean log produces no finding", async () => {
  const ctx = stubCtx({
    "journalctl -g \"system-sleep.*failed\" --since \"-7 days\" --no-pager -o short 2>/dev/null": "",
  });
  const findings = await suspend.run(ctx);
  assert.equal(findings.length, 0);
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
