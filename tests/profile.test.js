import { test } from "node:test";
import assert from "node:assert/strict";
import { detectProfile } from "../src/profile.js";

/** Stub exec: command string → { ok, stdout }. Unknown commands fail. */
function execStub(map) {
  return async (cmd) => {
    const entry = map[cmd];
    if (entry === undefined) return { ok: false, code: 1, stdout: "", stderr: "" };
    return { ok: true, code: 0, stdout: entry, stderr: "" };
  };
}

const SESSION = "loginctl list-sessions --no-legend 2>/dev/null | awk '$2==\"seat0\"{print $1}' | head -1";

test("detectProfile: a real battery makes it a laptop", async () => {
  const p = await detectProfile(execStub({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\nBAT0\n",
    "cat /sys/class/power_supply/BAT0/type 2>/dev/null": "Battery\n",
    [SESSION]: "3\n",
  }));
  assert.equal(p.kind, "laptop");
  assert.equal(p.hasBattery, true);
});

test("detectProfile: desktop when there is a graphical session and no battery", async () => {
  const p = await detectProfile(execStub({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\n",
    [SESSION]: "2\n",
  }));
  assert.equal(p.kind, "desktop");
});

test("detectProfile: server when confirmed headless (loginctl present, no session)", async () => {
  const p = await detectProfile(execStub({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\n",
    [SESSION]: "",
  }));
  assert.equal(p.kind, "server");
});

test("detectProfile: no loginctl defaults to desktop, not server", async () => {
  const p = await detectProfile(execStub({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\n",
  }));
  assert.equal(p.kind, "desktop");
});

test("detectProfile: wireless-device batteries do not count as laptop", async () => {
  const p = await detectProfile(execStub({
    "ls /sys/class/power_supply/ 2>/dev/null": "AC\nhidpp_battery_0\n",
    "cat /sys/class/power_supply/hidpp_battery_0/type 2>/dev/null": "Battery\n",
    [SESSION]: "2\n",
  }));
  assert.equal(p.kind, "desktop", "a Logitech receiver battery must not mark a desktop as laptop");
});
