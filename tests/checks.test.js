import { test } from "node:test";
import assert from "node:assert/strict";
import { memory } from "../src/checks/memory.js";
import { load } from "../src/checks/load.js";
import { disk } from "../src/checks/disk.js";
import { services } from "../src/checks/services.js";
import { journal } from "../src/checks/journal.js";
import { gpu } from "../src/checks/gpu.js";
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
