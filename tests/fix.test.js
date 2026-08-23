import { test } from "node:test";
import assert from "node:assert/strict";
import { planFixes, formatPlan } from "../src/fix.js";
import { spark, pickNextAction, renderReport } from "../src/report.js";
import { shouldNotify, canNotify, notificationFor } from "../src/notify.js";
import { fixCommandFor } from "../src/interactive.js";
import { parseArgs } from "../src/args.js";

const parse = (...flags) => parseArgs(["node", "bin/doctor.js", ...flags]);

// ---------- fix.js ----------

test("planFixes: user units get --user commands parsed from evidence", () => {
  const plan = planFixes([
    {
      id: 1,
      code: "services/failed",
      severity: "medium",
      title: "2 services failed to start",
      detail: "Failed: `app-picom@autostart.service`.",
      evidence: "app-picom@autostart.service\tuser",
    },
  ]);
  assert.equal(plan.length, 1);
  const cmds = plan[0].commands.map((c) => c.cmd);
  assert.ok(cmds.includes("systemctl --user reset-failed 'app-picom@autostart.service'"));
  assert.ok(cmds.includes("systemctl --user restart 'app-picom@autostart.service'"));
  assert.ok(plan[0].commands.every((c) => c.tier === "apply"));
});

test("planFixes: system units suggest sudo reset-failed only", () => {
  const plan = planFixes([
    { id: 1, code: "services/failed", severity: "medium", title: "t", detail: "`sshd.service` failed.", evidence: "sshd.service\tsystem" },
  ]);
  const cmds = plan[0].commands.map((c) => c.cmd);
  assert.deepEqual(cmds, ["sudo systemctl reset-failed 'sshd.service'"]);
});

test("planFixes: timers/broken re-arms the timer", () => {
  const plan = planFixes([
    { id: 1, code: "timers/broken", severity: "medium", title: "t", detail: null, evidence: "dnf-makecache.timer" },
  ]);
  assert.deepEqual(plan[0].commands.map((c) => c.cmd), ["sudo systemctl start 'dnf-makecache.timer'"]);
});

test("planFixes: updates/pending follows the package family", () => {
  const f = [{ id: 1, code: "updates/pending", severity: "info", title: "t" }];
  assert.equal(planFixes(f, { system: { family: "rhel" } })[0].commands[0].cmd, "sudo dnf upgrade");
  assert.equal(planFixes(f, { system: { family: "debian" } })[0].commands[0].cmd, "sudo apt update && sudo apt upgrade");
  assert.equal(planFixes(f, { system: { family: "arch" } })[0].commands[0].cmd, "sudo pacman -Syu");
  assert.equal(planFixes(f, { system: { family: "suse" } })[0].commands[0].cmd, "sudo zypper dup");
  // Image-based systems use the transactional updater; unknown families stay silent.
  assert.equal(planFixes(f, { system: { imageBased: true } })[0].commands[0].cmd, "rpm-ostree upgrade");
  assert.equal(planFixes(f, { system: {} }).length, 0);
});

test("planFixes: manual-tier commands are never applyable (reboot)", () => {
  const plan = planFixes([{ id: 1, code: "reboot/required", severity: "info", title: "t" }]);
  assert.equal(plan[0].commands[0].tier, "manual");
});

test("planFixes: unknown codes and findings without a catalog entry are skipped", () => {
  assert.deepEqual(planFixes([{ id: 1, code: "audio/no-output", severity: "medium", title: "t" }]), []);
  assert.deepEqual(planFixes([]), []);
});

test("formatPlan: dry run labels itself and never hides the confirmation step", () => {
  const plan = planFixes([{ id: 1, code: "fstrim/disabled", severity: "medium", title: "t" }]);
  const out = formatPlan(plan, { dryRun: true });
  assert.match(out, /dry run/);
  assert.match(out, /systemctl enable --now fstrim\.timer/);
  assert.match(out, /--fix --yes/);
});

test("formatPlan: empty plan says so honestly", () => {
  assert.match(formatPlan([], { dryRun: true }), /No safe fixes available/);
});

// ---------- report.js: sparkline + start here ----------

test("spark: fixed 0–100 scale, clamped, empty-safe", () => {
  assert.equal(spark([]), "");
  assert.equal(spark([null, 50]).length, 1);
  assert.equal(spark([0])[0], "▁");
  assert.equal(spark([100])[0], "█");
  assert.equal(spark([91, 92]), "▇▇"); // near-flat, honest
  assert.equal(spark([40, 70]), "▄▆"); // a real move is visible
});

test("pickNextAction: first finding with a fix, in report order", () => {
  const ordered = [
    { title: "a", fix: null },
    { title: "b", fix: "Do this." },
    { title: "c", fix: "Or this." },
  ];
  assert.equal(pickNextAction(ordered).n, 2);
  assert.equal(pickNextAction(ordered).finding.title, "b");
  assert.equal(pickNextAction([{ title: "a" }]), null);
});

test("renderReport: START HERE block appears before the first severity section", async () => {
  const out = await renderReport(
    [
      { id: 1, check: "services", severity: "high", title: "High thing", detail: null, evidence: null },
      { id: 2, check: "memory", severity: "medium", title: "Mem thing", detail: null, evidence: null, fix: "Free memory. Then re-run." },
    ],
    { system: { distro: "T", kernel: "k", cores: 1, uptime: "1h" }, score: 70 }
  );
  const startHere = out.indexOf("▶ START HERE");
  const section = out.indexOf("#2 Mem thing");
  assert.ok(startHere >= 0);
  assert.ok(section > startHere, "banner precedes the details");
  assert.match(out, /#2 Mem thing/); // numbering matches the banner
  assert.match(out, /Free memory\./);
});

test("renderReport: TREND line renders a capped sparkline window including the current run", async () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ score: 40 + i, counts: {} }));
  const out = await renderReport([], { system: { distro: "T", kernel: "k", cores: 1, uptime: "1h" }, score: 69, history });
  // Window = last 19 stored runs (51..68) + the current run (69) = 20 points.
  assert.match(out, /TREND    [▁▂▃▄▅▆▇█]+ +last 20 run\(s\) · 51 → 69 ▲/);
});

test("renderReport: no TREND line for a first-ever run (fewer than two points)", async () => {
  const out = await renderReport([], { system: { distro: "T", kernel: "k", cores: 1, uptime: "1h" }, score: 90, history: [] });
  assert.ok(!out.includes("TREND"));
});

test("renderReport: category tags render when the registry map is passed", async () => {
  const out = await renderReport(
    [{ id: 1, check: "memory", severity: "medium", title: "Low memory", fix: "Close apps." }],
    { system: { distro: "T", kernel: "k", cores: 1, uptime: "1h" }, categoryByCheck: new Map([["memory", "Memory"]]) }
  );
  assert.match(out, /1\. \[Memory\] Low memory/);
});

// ---------- notify.js ----------

test("shouldNotify: only NEW medium/high findings trigger it", () => {
  assert.equal(shouldNotify({ diff: { added: [] } }), false);
  assert.equal(shouldNotify({ diff: { added: [{ severity: "info" }] } }), false);
  assert.equal(shouldNotify({ diff: { added: [{ severity: "medium" }] } }), true);
  assert.equal(shouldNotify({ diff: { added: [{ severity: "high" }] } }), true);
  assert.equal(shouldNotify({}), false);
});

test("canNotify: requires some graphical session indicator", () => {
  assert.equal(canNotify({}), false);
  assert.equal(canNotify({ WAYLAND_DISPLAY: "wayland-0" }), true);
  assert.equal(canNotify({ DISPLAY: ":0" }), true);
});

test("notificationFor: mentions score and new count", () => {
  const n = notificationFor({ score: 61, newCount: 3, counts: { high: 1, medium: 2 } });
  assert.match(n.title, /urgent/);
  assert.match(n.body, /health 61\/100/);
  assert.match(n.body, /3 new since last run/);
});

// ---------- interactive.js ----------

test("fixCommandFor: returns the first apply command for the finding's code", () => {
  const plan = [
    { code: "a/x", commands: [{ cmd: "one", tier: "apply" }, { cmd: "two", tier: "apply" }] },
    { code: "b/y", commands: [{ cmd: "manual-only", tier: "manual" }] },
  ];
  assert.equal(fixCommandFor(plan, "a/x"), "one");
  assert.equal(fixCommandFor(plan, "b/y"), null);
  assert.equal(fixCommandFor(null, "a/x"), null);
});

// ---------- args.js ----------

test("parseArgs: --fix, --yes, --interactive and --notify are boolean flags", () => {
  const out = parse("--fix", "--yes", "--interactive", "--notify");
  assert.equal(out.fix, true);
  assert.equal(out.yes, true);
  assert.equal(out.interactive, true);
  assert.equal(out.notify, true);
  assert.equal(out.error, null);
});
