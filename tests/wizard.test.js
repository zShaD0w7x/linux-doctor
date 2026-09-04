import { test } from "node:test";
import assert from "node:assert/strict";
import { runWizard } from "../src/wizard.js";

/** Scripted answers; collected output lines. */
function harness({ answers = [], ...over } = {}) {
  const queue = [...answers];
  const lines = [];
  const calls = { write: 0, install: 0, notify: 0 };
  return {
    lines,
    calls,
    opts: {
      ask: async () => queue.shift() ?? "",
      print: (s) => lines.push(String(s)),
      isTTY: true,
      systemd: true,
      timer: { installed: false, enabled: false, active: false, systemd: true },
      profileKind: "server",
      configExists: false,
      doWriteConfig: () => { calls.write += 1; return "/tmp/fake-config.json"; },
      doInstallTimer: () => { calls.install += 1; return { ok: true, message: "timer on" }; },
      notifyCapable: true,
      doNotifyTest: () => { calls.notify += 1; return true; },
      ...over,
    },
  };
}

test("wizard: non-TTY prints copy-paste steps and touches nothing", async () => {
  const h = harness({ isTTY: false });
  const code = await runWizard(h.opts);
  assert.equal(code, 0);
  assert.ok(h.lines.some((l) => l.includes("--init-config")));
  assert.ok(h.lines.some((l) => l.includes("--install-timer")));
  assert.deepEqual(h.calls, { write: 0, install: 0, notify: 0 });
});

test("wizard: all-yes writes config, installs timer, tests notify", async () => {
  const h = harness({ answers: ["", "y", "yes"] });
  const code = await runWizard(h.opts);
  assert.equal(code, 0);
  assert.deepEqual(h.calls, { write: 1, install: 1, notify: 1 });
  assert.ok(h.lines.some((l) => l.includes("Detected: server")));
});

test("wizard: all-no skips every mutating step", async () => {
  const h = harness({ answers: ["n", "n", "n"] });
  await runWizard(h.opts);
  assert.deepEqual(h.calls, { write: 0, install: 0, notify: 0 });
});

test("wizard: existing config is left alone, active timer is not reinstalled", async () => {
  const h = harness({
    answers: [""],
    configExists: true,
    timer: { installed: true, enabled: true, active: true, systemd: true },
  });
  await runWizard(h.opts);
  assert.deepEqual(h.calls, { write: 0, install: 0, notify: 1 });
  assert.ok(h.lines.some((l) => l.includes("already exists")));
  assert.ok(h.lines.some((l) => l.includes("already installed and active")));
});

test("wizard: no systemd explains cron instead of offering the timer", async () => {
  const h = harness({ answers: [""], systemd: false });
  await runWizard(h.opts);
  assert.equal(h.calls.install, 0);
  assert.ok(h.lines.some((l) => l.includes("cron")));
});

test("wizard: failed install and notify are reported, never thrown", async () => {
  const h = harness({
    answers: ["", "", ""],
    doInstallTimer: () => ({ ok: false, error: "boom" }),
    doNotifyTest: () => false,
  });
  const code = await runWizard(h.opts);
  assert.equal(code, 0);
  assert.ok(h.lines.some((l) => l.includes("boom")));
  assert.ok(h.lines.some((l) => l.includes("did not accept it")));
});

test("wizard: --init parses as a boolean flag", async () => {
  const { parseArgs } = await import("../src/args.js");
  const out = parseArgs(["node", "bin/doctor.js", "--init"]);
  assert.equal(out.init, true);
  assert.equal(out.error, null);
});
