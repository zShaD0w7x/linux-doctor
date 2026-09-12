import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { detectProfile, SESSION_PROBE } from "../src/profile.js";

/** Stub exec: command string → { ok, stdout }. Unknown commands fail. */
function execStub(map) {
  return async (cmd) => {
    // Fixture keys are written unquoted; the code quotes interpolated
    // values (shq), so strip quotes before lookup.
    const entry = map[cmd] ?? map[cmd.replaceAll("'", "")];
    if (entry === undefined) return { ok: false, code: 1, stdout: "", stderr: "" };
    return { ok: true, code: 0, stdout: entry, stderr: "" };
  };
}

const SESSION = SESSION_PROBE;

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

// The bug was the awk field index ($2 is UID, not SEAT) and it was invisible
// because the tests stubbed the whole command. This runs the REAL probe
// pipeline against fixtures with shifted columns.
test("SESSION_PROBE: finds the seat-backed session regardless of column position", () => {
  const fixture = ["1 1000 u - 1766 manager - no -", "3 1000 u seat0 2416 user tty2 no -"];
  const cmd = SESSION_PROBE.replace(
    "loginctl list-sessions --no-legend 2>/dev/null",
    `printf '%s\\n' ${fixture.map((l) => `'${l}'`).join(" ")}`
  );
  assert.equal(execFileSync("sh", ["-c", cmd]).toString().trim(), "3");

  const headless = SESSION_PROBE.replace(
    "loginctl list-sessions --no-legend 2>/dev/null",
    "printf '%s\\n' '1 1000 u - 1766 manager - no -'"
  );
  assert.equal(execFileSync("sh", ["-c", headless]).toString().trim(), "");
});
