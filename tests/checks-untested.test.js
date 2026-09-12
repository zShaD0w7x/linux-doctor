/**
 * Behavior tests for checks that previously had none (analysis §7): oom, wifi,
 * orphans, packages, fs, cache. They ran only through the generic all-fail
 * path, so a parser regression would have been invisible. (boot/hardware are
 * already covered in tests/checks.test.js.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { detectDistro } from "../src/distro.js";
import { loadThresholds } from "../src/thresholds.js";
import { oom } from "../src/checks/oom.js";
import { wifi } from "../src/checks/wifi.js";
import { orphans } from "../src/checks/orphans.js";
import { packages } from "../src/checks/packages.js";
import { fs } from "../src/checks/fs.js";
import { cache } from "../src/checks/cache.js";

function stubCtx(map, osRelease = { id: "ubuntu", id_like: "debian" }) {
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

// ---------------------------------------------------------------- oom ---------

test("oom: one kill (two log lines, same pid) is a single medium finding", async () => {
  const ctx = stubCtx({
    "command -v journalctl 2>/dev/null": "/usr/bin/journalctl\n",
    "command -v dmesg 2>/dev/null": "/usr/bin/dmesg\n",
    "journalctl -k --no-pager -n 500 2>/dev/null | grep -iE 'Out of memory|Killed process|oom-killer|oom_reaper' | tail -n 20": "Out of memory: Killed process 1234 (chrome)\noom_reaper: reaped process 1234 (chrome)\n",
    "dmesg 2>/dev/null | grep -iE 'Out of memory|Killed process|oom-killer' | tail -n 20": "",
  });
  const findings = await oom.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "oom/kills");
  assert.equal(findings[0].severity, "medium", "a single kill must not be a 'pattern'");
  assert.match(findings[0].title, /1 OOM kill/);
});

test("oom: two kills (two pids) are high", async () => {
  const ctx = stubCtx({
    "command -v journalctl 2>/dev/null": "/usr/bin/journalctl\n",
    "command -v dmesg 2>/dev/null": "/usr/bin/dmesg\n",
    "journalctl -k --no-pager -n 500 2>/dev/null | grep -iE 'Out of memory|Killed process|oom-killer|oom_reaper' | tail -n 20": "Out of memory: Killed process 1234 (chrome)\nOut of memory: Killed process 5678 (firefox)\n",
    "dmesg 2>/dev/null | grep -iE 'Out of memory|Killed process|oom-killer' | tail -n 20": "",
  });
  const findings = await oom.run(ctx);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].title, /2 OOM kill/);
});

// --------------------------------------------------------------- wifi ---------

test("wifi: soft-blocked is medium", async () => {
  const ctx = stubCtx({
    "rfkill list wifi 2>/dev/null; rfkill list wlan 2>/dev/null": "0: phy0: Wireless LAN\n\tSoft blocked: yes\n\tHard blocked: no\n",
    "nmcli radio wifi 2>/dev/null; nmcli device status 2>/dev/null | grep -i wifi": "enabled\n",
    "lspci -nn 2>/dev/null | grep -iE 'network|wireless|wlan'": "0b:00.0 Network controller: Intel\n",
  });
  const findings = await wifi.run(ctx);
  assert.equal(findings[0].code, "wifi/blocked");
  assert.equal(findings[0].severity, "medium");
});

test("wifi: disabled in NetworkManager is medium", async () => {
  const ctx = stubCtx({
    "rfkill list wifi 2>/dev/null; rfkill list wlan 2>/dev/null": "0: phy0: Wireless LAN\n\tSoft blocked: no\n",
    "nmcli radio wifi 2>/dev/null; nmcli device status 2>/dev/null | grep -i wifi": "disabled\n",
    "lspci -nn 2>/dev/null | grep -iE 'network|wireless|wlan'": "0b:00.0 Network controller: Intel\n",
  });
  const findings = await wifi.run(ctx);
  assert.equal(findings[0].code, "wifi/disabled");
});

test("wifi: no adapter at all is informational", async () => {
  const findings = await wifi.run(stubCtx({}));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "wifi/no-adapter");
  assert.equal(findings[0].severity, "info");
});

// ------------------------------------------------------------ orphans ---------

test("orphans: 12 removable apt packages is medium", async () => {
  const remv = Array.from({ length: 12 }, (_, i) => `Remv lib${i} [1.0]`).join("\n") + "\n";
  const ctx = stubCtx({ "apt-get -s autoremove 2>/dev/null | grep -E '^Remv '": remv });
  const findings = await orphans.run(ctx);
  assert.equal(findings[0].code, "orphans/many");
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].fix, /apt autoremove/);
});

test("orphans: none is informational", async () => {
  const ctx = stubCtx({ "apt-get -s autoremove 2>/dev/null | grep -E '^Remv '": "" });
  const findings = await orphans.run(ctx);
  assert.equal(findings[0].code, "orphans/none");
});

test("orphans: a couple of arch orphans is informational", async () => {
  const ctx = stubCtx({ "pacman -Qtdq 2>/dev/null": "libfoo\nlibbar\n" }, { id: "arch" });
  const findings = await orphans.run(ctx);
  assert.equal(findings[0].code, "orphans/some");
  assert.equal(findings[0].severity, "info");
});

// ----------------------------------------------------------- packages ---------

test("packages: a broken dpkg database is high", async () => {
  const ctx = stubCtx({
    "dpkg --audit 2>&1 | head -20": "The following packages are in a mess due to serious problems during installation:\n libfoo\n",
    "apt-get check 2>&1 | head -20": "",
    "ls /var/lib/dpkg/lock* /var/lib/apt/lists/lock 2>/dev/null; fuser /var/lib/dpkg/lock 2>/dev/null | head -1": "",
  });
  const findings = await packages.run(ctx);
  assert.equal(findings[0].code, "packages/broken");
  assert.equal(findings[0].severity, "high");
});

test("packages: a held apt lock is medium", async () => {
  const ctx = stubCtx({
    "dpkg --audit 2>&1 | head -20": "",
    "apt-get check 2>&1 | head -20": "",
    "ls /var/lib/dpkg/lock* /var/lib/apt/lists/lock 2>/dev/null; fuser /var/lib/dpkg/lock 2>/dev/null | head -1": "/var/lib/dpkg/lock\n4242\n",
  });
  const findings = await packages.run(ctx);
  assert.equal(findings[0].code, "packages/locked");
  assert.equal(findings[0].severity, "medium");
});

test("packages: a healthy apt database is informational", async () => {
  const ctx = stubCtx({
    "dpkg --audit 2>&1 | head -20": "",
    "apt-get check 2>&1 | head -20": "",
    "ls /var/lib/dpkg/lock* /var/lib/apt/lists/lock 2>/dev/null; fuser /var/lib/dpkg/lock 2>/dev/null | head -1": "",
  });
  const findings = await packages.run(ctx);
  assert.equal(findings[0].code, "packages/ok");
});

// ----------------------------------------------------------------- fs ---------

test("fs: a read-only remount is high", async () => {
  const ctx = stubCtx({
    "command -v journalctl 2>/dev/null": "/usr/bin/journalctl\n",
    "command -v dmesg 2>/dev/null": "",
    "journalctl -k --no-pager -n 500 2>/dev/null | grep -iE 'EXT4-fs error|I/O error|buffer I/O error|BTRFS.*error|btrfs.*error|XFS.*error|xfs.*error|I/O stall' | tail -n 20": "",
    "dmesg 2>/dev/null | grep -iE 'EXT4-fs error|I/O error|buffer I/O error|BTRFS|Remounting filesystem read-only' | tail -n 20": "EXT4-fs error (device sda2): remounting filesystem read-only\n",
    "dmesg 2>/dev/null | grep -i 'Remounting filesystem read-only' | tail -n 5": "EXT4-fs (sda2): Remounting filesystem read-only\n",
  });
  const findings = await fs.run(ctx);
  assert.equal(findings[0].code, "fs/readonly-remount");
  assert.equal(findings[0].severity, "high");
});

test("fs: a clean kernel log is informational", async () => {
  const ctx = stubCtx({
    "command -v journalctl 2>/dev/null": "/usr/bin/journalctl\n",
    "command -v dmesg 2>/dev/null": "",
    "journalctl -k --no-pager -n 500 2>/dev/null | grep -iE 'EXT4-fs error|I/O error|buffer I/O error|BTRFS.*error|btrfs.*error|XFS.*error|xfs.*error|I/O stall' | tail -n 20": "",
    "dmesg 2>/dev/null | grep -iE 'EXT4-fs error|I/O error|buffer I/O error|BTRFS|Remounting filesystem read-only' | tail -n 20": "",
    "dmesg 2>/dev/null | grep -i 'Remounting filesystem read-only' | tail -n 5": "",
  });
  const findings = await fs.run(ctx);
  assert.equal(findings[0].code, "fs/ok");
  assert.equal(findings[0].severity, "info");
});

// -------------------------------------------------------------- cache ---------

test("cache: a 12 GB user cache is medium", async () => {
  const ctx = stubCtx({
    'du -sb "$HOME/.cache" 2>/dev/null | cut -f1': "12000000000\n",
    'du -sb "$HOME/.local/share/Trash" 2>/dev/null | cut -f1': "",
  });
  const findings = await cache.run(ctx);
  assert.equal(findings[0].code, "cache/large");
  assert.equal(findings[0].severity, "medium");
});

test("cache: a small cache is silent (no false positive)", async () => {
  const ctx = stubCtx({
    'du -sb "$HOME/.cache" 2>/dev/null | cut -f1': "100000000\n",
    'du -sb "$HOME/.local/share/Trash" 2>/dev/null | cut -f1': "",
  });
  const findings = await cache.run(ctx);
  assert.ok(!findings.some((f) => /medium|high/.test(f.severity)), "a 100 MB cache must not alarm");
});
