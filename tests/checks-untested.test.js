/**
 * Behavior tests for checks that previously had none (analysis §7): oom, wifi,
 * orphans, boot. They ran only through the generic all-fail path, so a parser
 * regression would have been invisible.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { detectDistro } from "../src/distro.js";
import { loadThresholds } from "../src/thresholds.js";
import { oom } from "../src/checks/oom.js";
import { wifi } from "../src/checks/wifi.js";
import { orphans } from "../src/checks/orphans.js";
import { boot } from "../src/checks/boot.js";

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
  const ctx = stubCtx({
    "apt-get -s autoremove 2>/dev/null | grep -E '^Remv ' | wc -l": "12\n",
    "apt-get -s autoremove 2>/dev/null | grep -E '^Remv ' | head -5": "Remv libfoo [1.0]\nRemv libbar [2.0]\n",
  });
  const findings = await orphans.run(ctx);
  assert.equal(findings[0].code, "orphans/many");
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].fix, /apt autoremove/);
});

test("orphans: none is informational", async () => {
  const ctx = stubCtx({ "apt-get -s autoremove 2>/dev/null | grep -E '^Remv ' | wc -l": "0\n" });
  const findings = await orphans.run(ctx);
  assert.equal(findings[0].code, "orphans/none");
});

test("orphans: a couple of arch orphans is informational", async () => {
  const ctx = stubCtx({ "pacman -Qtdq 2>/dev/null": "libfoo\nlibbar\n" }, { id: "arch" });
  const findings = await orphans.run(ctx);
  assert.equal(findings[0].code, "orphans/some");
  assert.equal(findings[0].severity, "info");
});

// --------------------------------------------------------------- boot ---------

test("boot: a 95% full /boot is high", async () => {
  const ctx = stubCtx({
    "df -P /boot 2>/dev/null | tail -1": "/dev/sda1 524288 498073 26215 95% /boot\n",
    "test -d /boot 2>/dev/null && echo yes": "yes\n",
  });
  const findings = await boot.run(ctx);
  const full = findings.find((f) => f.code === "boot/full");
  assert.ok(full, "expected a boot/full finding");
  assert.equal(full.severity, "high");
});

test("boot: image-based systems are skipped entirely", async () => {
  const ctx = stubCtx({}, { id: "bazzite" });
  assert.equal(ctx.dist.imageBased, true, "sanity: bazzite must be image-based");
  assert.deepEqual(await boot.run(ctx), []);
});

test("boot: a bootloader-less /boot with kernels is medium", async () => {
  const ctx = stubCtx({
    "df -P /boot 2>/dev/null | tail -1": "/dev/sda1 524288 100000 424288 19% /boot\n",
    "ls /boot/grub/grub.cfg /boot/grub2/grub.cfg /boot/loader/entries/*.conf 2>/dev/null | head -1": "",
    "ls /boot/efi/EFI/*/grub*.cfg /boot/efi/EFI/*/grubx64.efi 2>/dev/null | head -1": "",
    "test -d /boot 2>/dev/null && echo yes": "yes\n",
    "ls /boot/vmlinuz-* 2>/dev/null | head -1": "/boot/vmlinuz-6.8\n",
  });
  const findings = await boot.run(ctx);
  assert.equal(findings[0].code, "boot/no-config");
  assert.equal(findings[0].severity, "medium");
});
