import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDistro } from "../src/distro.js";
import { loadThresholds } from "../src/thresholds.js";
import { ssh } from "../src/checks/ssh.js";
import { snap } from "../src/checks/snap.js";
import { zram } from "../src/checks/zram.js";
import { locales } from "../src/checks/locales.js";
import { autologin } from "../src/checks/autologin.js";
import { fstrim } from "../src/checks/fstrim.js";

function stubCtx(map, osRelease = { id: "bazzite", id_like: "fedora" }) {
  return {
    dist: detectDistro(osRelease),
    thresholds: loadThresholds({}),
    run: async (cmd) => {
      const entry = map[cmd];
      if (entry === undefined) return { ok: false, code: 1, stdout: "", stderr: "" };
      return { ok: true, code: 0, stdout: entry, stderr: "" };
    },
  };
}

const SSH_CFG = "grep -rhE '^\\s*(PermitRootLogin|PasswordAuthentication)\\s+' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ 2>/dev/null";

test("ssh: silent when no SSH server is installed", async () => {
  const ctx = stubCtx({});
  assert.deepEqual(await ssh.run(ctx), []);
});

test("ssh: root login with password is high severity", async () => {
  const ctx = stubCtx({
    "systemctl is-active sshd 2>/dev/null": "active",
    [SSH_CFG]: "PermitRootLogin yes\nPasswordAuthentication yes\n",
  });
  const findings = await ssh.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].code, /ssh\/root-password/);
});

test("ssh: root login key-only still allows password mode is medium", async () => {
  const ctx = stubCtx({
    "systemctl is-active sshd 2>/dev/null": "active",
    [SSH_CFG]: "PermitRootLogin yes\nPasswordAuthentication no\n",
  });
  const findings = await ssh.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].code, /ssh\/root-login/);
});

test("ssh: last drop-in wins (prohibit-password overrides earlier yes)", async () => {
  const ctx = stubCtx({
    "systemctl is-active sshd 2>/dev/null": "active",
    [SSH_CFG]: "PermitRootLogin yes\nPermitRootLogin prohibit-password\n",
  });
  const findings = await ssh.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /ssh\/ok/);
});

test("ssh: sane config (or defaults) is informational", async () => {
  const ctx = stubCtx({ "systemctl is-active sshd 2>/dev/null": "active" });
  const findings = await ssh.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /ssh\/ok/);
});

test("snap: silent when snap is not installed", async () => {
  const ctx = stubCtx({});
  assert.deepEqual(await snap.run(ctx), []);
});

test("snap: pending refreshes with an active timer are informational", async () => {
  const ctx = stubCtx({
    "command -v snap 2>/dev/null": "/usr/bin/snap",
    "snap refresh --list 2>/dev/null": "Name          Version   Rev    Publisher     Notes\ncore20        2/2026    2285   canonical**    -\nfirefox       140/2026  3797   mozilla       -\n",
    "systemctl list-timers snapd.* --no-pager 2>/dev/null": "NEXT                         LEFT       LAST                         PASSED    UNIT\nMon 2026-08-24 00:00:00 UTC  4 days     N/A                          N/A       snapd.refresh.timer",
  });
  const findings = await snap.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /snap\/pending/);
});

test("snap: a large backlog is medium severity", async () => {
  const ctx = stubCtx({
    "command -v snap 2>/dev/null": "/usr/bin/snap",
    "snap refresh --list 2>/dev/null": "Name          Version   Rev    Publisher\ncore20        1\ncore22        1\nfirefox       1\nspotify       1\nvlc           1\ngimp          1\n",
    "systemctl list-timers snapd.* --no-pager 2>/dev/null": "NEXT  LAST  UNIT\nMon 2026-08-24 00:00:00 UTC N/A  snapd.refresh.timer",
  });
  const findings = await snap.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
});

test("snap: disabled refresh timer is flagged even with zero pending", async () => {
  const ctx = stubCtx({
    "command -v snap 2>/dev/null": "/usr/bin/snap",
    "snap refresh --list 2>/dev/null": "",
    "snap list 2>/dev/null": "Name  Version  Rev  Tracking\nfirefox 140 3797 latest/stable",
  });
  const findings = await snap.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].code, /snap\/no-timer/);
});

test("zram: healthy zram is informational", async () => {
  const ctx = stubCtx({
    "cat /proc/sys/vm/swappiness": "60",
    "swapon --show --bytes": "NAME       TYPE      SIZE        USED      PRIO\n/dev/zram0 partition 8388608000 1048576000 100",
  });
  const findings = await zram.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /zram\/ok/);
});

test("zram: compressed swap nearly full is medium", async () => {
  const ctx = stubCtx({
    "cat /proc/sys/vm/swappiness": "60",
    "swapon --show --bytes": "NAME       TYPE      SIZE        USED      PRIO\n/dev/zram0 partition 8388608000 7717519360 100",
  });
  const findings = await zram.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].code, /zram\/full/);
});

test("zram: no zram but very high swappiness is informational", async () => {
  const ctx = stubCtx({
    "cat /proc/sys/vm/swappiness": "100",
  });
  const findings = await zram.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /zram\/swappiness/);
});

test("zram: no zram and sane swappiness is silent", async () => {
  const ctx = stubCtx({ "cat /proc/sys/vm/swappiness": "60" });
  assert.deepEqual(await zram.run(ctx), []);
});

test("locales: broken locale is medium", async () => {
  const ctx = stubCtx({
    "locale 2>&1": "locale: Cannot set LC_CTYPE to default locale: No such file or directory\nLANG=en_US.UTF-8\nLC_ALL=\n",
  });
  const findings = await locales.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].code, /locales\/broken/);
});

test("locales: healthy locale is silent", async () => {
  const ctx = stubCtx({
    "locale 2>&1": "LANG=en_US.UTF-8\nLC_CTYPE=\"en_US.UTF-8\"\nLC_ALL=\n",
  });
  assert.deepEqual(await locales.run(ctx), []);
});

test("autologin: enabled automatic login is medium", async () => {
  const ctx = stubCtx({
    "grep -rEn 'AutomaticLoginEnable|AutologinUser|Autologin|autologin-user' /etc/gdm /etc/sddm.conf /etc/sddm.conf.d/ /etc/lightdm/ /etc/lxdm/ 2>/dev/null":
      "/etc/sddm.conf.d/autologin.conf:3:AutologinUser=jane\n",
  });
  const findings = await autologin.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].code, /security\/autologin/);
});

test("autologin: no autologin config is silent", async () => {
  const ctx = stubCtx({});
  assert.deepEqual(await autologin.run(ctx), []);
});
test("fstrim: weekly timer enabled is informational", async () => {
  const ctx = stubCtx({
    "lsblk -dno NAME,ROTA 2>/dev/null": "sda 1\nnvme0n1 0\n",
    "systemctl is-enabled fstrim.timer 2>/dev/null": "enabled\n",
    "systemctl show fstrim.timer -p LastTriggerUSec --value 2>/dev/null": "Mon 2026-08-17 00:12:44 EEST\n",
  });
  const findings = await fstrim.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /fstrim\/ok$/);
});

test("fstrim: continuous discard mount covers without a timer", async () => {
  const ctx = stubCtx({
    "lsblk -dno NAME,ROTA 2>/dev/null": "nvme0n1 0\n",
    "systemctl is-enabled fstrim.timer 2>/dev/null": "disabled\n",
    "findmnt -no OPTIONS -t ext4,xfs,btrfs,f2fs 2>/dev/null": "rw,relatime,discard=async,ssd\n",
  });
  const findings = await fstrim.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /discard/);
});

test("fstrim: HDD-only system stays silent", async () => {
  const ctx = stubCtx({
    "lsblk -dno NAME,ROTA 2>/dev/null": "sda 1\nsdb 1\n",
  });
  assert.deepEqual(await fstrim.run(ctx), []);
});

test("fstrim: SSD with no TRIM mechanism is medium with an enable fix", async () => {
  const ctx = stubCtx({
    "lsblk -dno NAME,ROTA 2>/dev/null": "nvme0n1 0\nsda 1\n",
    "systemctl is-enabled fstrim.timer 2>/dev/null": "disabled\n",
  });
  const findings = await fstrim.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].fix, /systemctl enable --now fstrim\.timer/);
});
