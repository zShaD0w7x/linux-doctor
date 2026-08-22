import { test } from "node:test";
import assert from "node:assert/strict";
import { hardening } from "../src/checks/pro/hardening.js";
import { scrub } from "../src/checks/pro/scrub.js";
import { boottime } from "../src/checks/pro/boottime.js";
import { connets } from "../src/checks/pro/connets.js";
import { journalcap } from "../src/checks/pro/journalcap.js";
import { detectDistro } from "../src/distro.js";
import { loadThresholds } from "../src/thresholds.js";

function stubCtx(map) {
  return {
    dist: detectDistro({ id: "bazzite", id_like: "fedora" }),
    thresholds: loadThresholds({}),
    run: async (cmd) => {
      // Fixture keys are written unquoted; the checks quote interpolated
      // values (shq), so strip quotes before lookup.
      const entry = map[cmd] ?? map[cmd.replaceAll("'", "")];
      if (entry === undefined) return { ok: false, code: 1, stdout: "", stderr: "" };
      return { ok: true, code: 0, stdout: entry, stderr: "" };
    },
  };
}

const PRO_CHECKS = [hardening, scrub, boottime, connets, journalcap];

test("every premium check is flagged premium", () => {
  for (const c of PRO_CHECKS) assert.equal(c.premium, true, `${c.id} must be premium`);
});

test("hardening: all settings on is informational", async () => {
  const ctx = stubCtx({
    "sysctl -n kernel.kptr_restrict 2>/dev/null": "2",
    "sysctl -n kernel.dmesg_restrict 2>/dev/null": "1",
    "sysctl -n kernel.perf_event_paranoid 2>/dev/null": "3",
    "sysctl -n kernel.unprivileged_bpf_disabled 2>/dev/null": "1",
    "sysctl -n net.ipv4.conf.all.rp_filter 2>/dev/null": "1",
    "sysctl -n net.ipv4.tcp_syncookies 2>/dev/null": "1",
  });
  const findings = await hardening.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /hardening\/ok/);
});

test("hardening: missing settings surface a finding with the keys", async () => {
  const ctx = stubCtx({
    "sysctl -n kernel.kptr_restrict 2>/dev/null": "0",
  });
  const findings = await hardening.run(ctx);
  assert.equal(findings.length, 1);
  assert.match(findings[0].code, /hardening\/missing/);
  assert.match(findings[0].detail, /kernel\.kptr_restrict/);
  assert.equal(findings[0].severity, "high", "5+ missing settings is high");
});

test("scrub: no ZFS or Btrfs is silent", async () => {
  const ctx = stubCtx({});
  assert.deepEqual(await scrub.run(ctx), []);
});

test("scrub: a ZFS pool that was never scrubbed is medium", async () => {
  const ctx = stubCtx({
    "zpool status 2>/dev/null": "  pool: tank\n state: ONLINE\n  scan: scrub repair in progress ...\n  scan: scrub, none requested\n",
  });
  const findings = await scrub.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].code, /scrub\/stale/);
});

test("scrub: a recent ZFS scrub is informational", async () => {
  const d = new Date(Date.now() - 2 * 86400 * 1000);
  const [wkd, mon, day, year] = d.toDateString().split(" ");
  const line = `  scan: scrub repaired 0B in 00:00:04 with 0 errors on ${wkd} ${mon} ${day} 08:15:00 ${year}`;
  const ctx = stubCtx({ "zpool status 2>/dev/null": line });
  const findings = await scrub.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /scrub\/ok/);
});

test("boottime: a fast boot is informational", async () => {
  const ctx = stubCtx({
    "systemd-analyze 2>/dev/null": "Startup finished in 1.0s (kernel) + 5.0s (userspace) = 6.0s",
  });
  const findings = await boottime.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].title, /6\.0s/);
});

test("boottime: a slow boot is medium", async () => {
  const ctx = stubCtx({
    "systemd-analyze 2>/dev/null": "Startup finished in 10.0s (kernel) + 75.2s (userspace) = 85.2s",
    "systemd-analyze blame --no-pager 2>/dev/null | head -3": "30.1s networkd-wait-online.service\n20.5s dev-sda1.device",
  });
  const findings = await boottime.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].code, /boottime\/slow/);
  assert.match(findings[0].evidence, /networkd-wait-online/);
});

test("connets: no container runtime is silent", async () => {
  const ctx = stubCtx({});
  assert.deepEqual(await connets.run(ctx), []);
});

test("connets: a down container bridge is high", async () => {
  const ctx = stubCtx({
    "command -v podman >/dev/null 2>&1 && echo podman || command -v docker >/dev/null 2>&1 && echo docker": "podman",
    "ip -br link show type bridge 2>/dev/null": "podman0 DOWN\ncni-podman0 UP",
  });
  const findings = await connets.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].code, /connets\/down/);
  assert.match(findings[0].detail, /podman0/);
});

test("journalcap: no configured cap is medium", async () => {
  const ctx = stubCtx({
    "journalctl --disk-usage 2>/dev/null": "4.0G",
  });
  const findings = await journalcap.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].code, /journalcap\/none/);
  assert.match(findings[0].fix, /SystemMaxUse/);
});

test("journalcap: a healthy cap is informational", async () => {
  const ctx = stubCtx({
    "grep -rhE '^[^#]*SystemMaxUse=' /etc/systemd/journald.conf /etc/systemd/journald.conf.d/ 2>/dev/null": "SystemMaxUse=500M",
    "journalctl --disk-usage 2>/dev/null": "100.0M",
  });
  const findings = await journalcap.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].code, /journalcap\/ok/);
});