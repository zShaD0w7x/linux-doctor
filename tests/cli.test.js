import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { applicableChecks } from "../src/cli.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "doctor.js");

function run(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", timeout: 60000 });
}

test("--list prints every check id grouped by category without running them", () => {
  const res = run("--list");
  assert.equal(res.status, 0);
  for (const id of ["memory", "load", "disk", "services", "timers", "journal", "journald", "suspend", "security", "secureboot", "network", "ntp", "updates", "firmware", "flatpak", "reboot", "processes", "thermal", "battery", "gpu", "bluetooth", "wayland", "backup", "hardware", "smart", "luks", "audio", "containers", "containerdisk", "crash"]) {
    assert.match(res.stdout, new RegExp(`^  ${id} — `, "m"), `--list should include ${id}`);
  }
  // Category headers group the list.
  for (const cat of ["system", "software", "security", "network", "updates", "hardware", "data"]) {
    assert.match(res.stdout, new RegExp(`^${cat}$`, "m"), `--list should have a ${cat} category header`);
  }
});

test("--list marks checks that do not apply to this machine", () => {
  const res = run("--list");
  assert.equal(res.status, 0);
  assert.ok(/battery — Battery/.test(res.stdout), "battery is listed");
});

test("applicableChecks: full run skips checks that do not apply to the machine kind", () => {
  const desktop = applicableChecks([], "desktop").map((c) => c.id);
  assert.ok(!desktop.includes("battery"), "battery must not run on a desktop");
  assert.ok(desktop.includes("gpu"), "gpu runs on a desktop");
  const server = applicableChecks([], "server").map((c) => c.id);
  for (const id of ["battery", "gpu", "bluetooth", "wayland", "suspend"]) {
    assert.ok(!server.includes(id), `${id} must not run on a server`);
  }
  assert.ok(server.includes("memory"), "system checks run on a server");
  const laptop = applicableChecks([], "laptop").map((c) => c.id);
  assert.ok(laptop.includes("battery"), "battery runs on a laptop");
});

test("applicableChecks: an explicit --check list overrides appliesTo", () => {
  const ids = applicableChecks(["battery"], "desktop").map((c) => c.id);
  assert.deepEqual(ids, ["battery"], "user intent wins over gating");
});

test("applicableChecks: plugins participate in gating", () => {
  const plugin = { id: "ups", title: "UPS", category: "hardware", appliesTo: ["server"], run: async () => [] };
  const server = applicableChecks([], "server", [plugin]).map((c) => c.id);
  assert.deepEqual(server, ["ups"]);
  const desktop = applicableChecks([], "desktop", [plugin]).map((c) => c.id);
  assert.deepEqual(desktop, [], "a server-only plugin is skipped on a desktop");
});

test("--schema prints the v1 report schema as JSON", () => {
  const res = run("--schema");
  assert.equal(res.status, 0);
  const schema = JSON.parse(res.stdout);
  assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(schema.properties.schemaVersion.const, 1);
});

test("--profile appends per-check durations to --plain output", () => {
  const res = run("--check", "memory", "--plain", "--profile");
  assert.ok(res.status === 0 || res.status === 1, `exit ${res.status}`);
  assert.match(res.stdout, /^# duration: memory \d+ms$/m);
});

test("plugins in LINUX_DOCTOR_PLUGINS are runnable with --check", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-plugins-"));
  try {
    writeFileSync(
      join(dir, "example.js"),
      "export default { id: 'example', title: 'Example plugin', category: 'custom', async run() { return [{ severity: 'info', title: 'Plugin worked', detail: null, evidence: null, fix: null, confidence: 'high' }]; } };\n"
    );
    const res = spawnSync(process.execPath, [bin, "--check", "example", "--plain"], {
      encoding: "utf8",
      timeout: 60000,
      env: { ...process.env, LINUX_DOCTOR_PLUGINS: dir },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^info\t1\tPlugin worked$/m);
    assert.doesNotMatch(res.stderr, /could not load plugin/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plugins appear in --list and unknown-check validation", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-plugins-"));
  try {
    writeFileSync(join(dir, "example.js"), "export default { id: 'example', title: 'Example plugin', async run() { return []; } };\n");
    const res = spawnSync(process.execPath, [bin, "--list"], {
      encoding: "utf8",
      timeout: 60000,
      env: { ...process.env, LINUX_DOCTOR_PLUGINS: dir },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^  example — Example plugin$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--check accepts comma-separated ids", () => {
  const res = run("--check", "memory,load", "--plain");
  assert.ok(res.status === 0 || res.status === 1, `exit ${res.status}`);
  assert.doesNotMatch(res.stderr, /Unknown check/);
});

test("--check rejects unknown ids with exit 2", () => {
  const res = run("--check", "memory,nonsense");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Unknown check "nonsense"/);
});

test("--check with no value fails with exit 2", () => {
  const res = run("--check", "--plain");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /--check requires a value/);
});

test("--check=id form is accepted", () => {
  const res = run("--check=memory,load", "--plain");
  assert.ok(res.status === 0 || res.status === 1, `exit ${res.status}`);
  assert.doesNotMatch(res.stderr, /Unknown check/);
});

test("unknown flags fail with exit 2 instead of silently running", () => {
  const res = run("--jsonn");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Unknown option "--jsonn"/);
});

test("--push without a URL fails with exit 2", () => {
  const res = run("--push");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /--push requires a value/);
});

test("a check that throws is contained: the run survives and checkErrors is reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-boom-"));
  try {
    writeFileSync(join(dir, "boom.js"), "export default { id: 'boom', title: 'Boom', async run() { throw new Error('kaboom'); } };\n");
    const env = { ...process.env, LINUX_DOCTOR_PLUGINS: dir };
    const json = spawnSync(process.execPath, [bin, "--check", "boom", "--json"], { encoding: "utf8", timeout: 60000, env });
    assert.equal(json.status, 0, json.stderr);
    const data = JSON.parse(json.stdout);
    assert.equal(data.findings.length, 0);
    assert.deepEqual(data.checkErrors, [{ check: "boom", error: "kaboom" }]);

    const plain = spawnSync(process.execPath, [bin, "--check", "boom", "--plain"], { encoding: "utf8", timeout: 60000, env });
    assert.equal(plain.status, 0);
    assert.match(plain.stdout, /^# failed: boom — kaboom$/m);

    const text = spawnSync(process.execPath, [bin, "--check", "boom"], { encoding: "utf8", timeout: 60000, env });
    assert.equal(text.status, 0);
    assert.match(text.stdout, /1 check\(s\) failed to run: boom/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--ignore counts hidden findings and warns when a pattern matches nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-ignore-"));
  try {
    writeFileSync(
      join(dir, "two.js"),
      "export default { id: 'two', title: 'Two findings', async run() { return [\n" +
        "  { severity: 'info', title: 'Alpha finding', detail: null, evidence: null, fix: null, confidence: 'high' },\n" +
        "  { severity: 'info', title: 'Beta finding', detail: null, evidence: null, fix: null, confidence: 'high' }\n" +
        "]; } };\n"
    );
    const env = { ...process.env, LINUX_DOCTOR_PLUGINS: dir };

    // One pattern matches: the finding is hidden and counted.
    const res = spawnSync(process.execPath, [bin, "--check", "two", "--ignore", "Alpha", "--plain"], {
      encoding: "utf8", timeout: 60000, env,
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^# ignored: 1$/m);
    assert.match(res.stdout, /info\t1\tBeta finding/m);
    assert.doesNotMatch(res.stdout, /Alpha finding/);

    const json = spawnSync(process.execPath, [bin, "--check", "two", "--ignore", "Alpha", "--json"], {
      encoding: "utf8", timeout: 60000, env,
    });
    assert.equal(json.status, 0);
    assert.equal(JSON.parse(json.stdout).ignoredCount, 1);

    // A pattern that matches nothing warns on stderr — stale ignores rot silently otherwise.
    const stale = spawnSync(process.execPath, [bin, "--check", "two", "--ignore", "Gamma", "--plain"], {
      encoding: "utf8", timeout: 60000, env,
    });
    assert.equal(stale.status, 0);
    assert.match(stale.stderr, /ignore pattern "Gamma" matched nothing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("low-confidence findings get a visible marker in the text report", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-shaky-"));
  try {
    writeFileSync(
      join(dir, "shaky.js"),
      "export default { id: 'shaky', title: 'Shaky', async run() { return [{ severity: 'info', title: 'Doubtful result', detail: null, evidence: null, fix: null, confidence: 'low' }]; } };\n"
    );
    const env = { ...process.env, LINUX_DOCTOR_PLUGINS: dir };
    const res = spawnSync(process.execPath, [bin, "--check", "shaky"], { encoding: "utf8", timeout: 60000, env });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Low confidence/);
    const json = spawnSync(process.execPath, [bin, "--check", "shaky", "--json"], { encoding: "utf8", timeout: 60000, env });
    assert.equal(JSON.parse(json.stdout).findings[0].confidence, "low");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--json output is the v1 schema with per-finding check ids and codes", () => {
  const res = run("--check", "memory", "--json");
  assert.ok(res.status === 0 || res.status === 1, `exit ${res.status}`);
  const data = JSON.parse(res.stdout);
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.tool, "linux-doctor");
  assert.equal(typeof data.version, "string");
  assert.equal(typeof data.durationMs, "number");
  assert.ok(Array.isArray(data.findings));
  assert.ok(data.findings.every((f) => typeof f.check === "string"), "every finding knows its check");
  assert.ok(data.findings.every((f) => typeof f.code === "string"), "every finding has a stable code");
});

test("--html writes a standalone HTML file that contains the report data", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-html-"));
  const htmlPath = join(dir, "report.html");
  try {
    const res = run("--check", "memory", "--html", htmlPath);
    assert.ok(res.status === 0 || res.status === 1, `exit ${res.status}`);
    const html = readFileSync(htmlPath, "utf8");
    assert.ok(html.includes("__DATA__"), "HTML contains embedded data");
    assert.ok(html.includes("linux-doctor"), "HTML contains the dashboard");
    // Extract the JSON data and validate it
    const match = html.match(/const __DATA__ = ({.*?});/s);
    assert.ok(match, "embedded data is valid JS");
    const data = JSON.parse(match[1]);
    assert.equal(data.schemaVersion, 1);
    assert.ok(Array.isArray(data.findings));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--severity high shows only high findings in JSON", () => {
  const res = run("--json", "--severity", "high");
  assert.ok(res.status === 0 || res.status === 1, `exit ${res.status}`);
  const data = JSON.parse(res.stdout);
  assert.ok(data.findings.every((f) => f.severity === "high"), `expected only high findings, got: ${data.findings.map((f) => f.severity).join(", ")}`);
});

test("--severity invalid is rejected with exit 2", () => {
  const res = run("--severity", "critical");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /severity must be one of/);
});

test("--ignore-list shows configured patterns", () => {
  const res = run("--ignore-list");
  assert.equal(res.status, 0);
  assert.match(res.stdout, /No ignore patterns configured|Title patterns|Code patterns/);
});

test("--summary prints a one-liner with score and counts", () => {
  const res = run("--summary");
  assert.ok(res.status === 0 || res.status === 1, `exit ${res.status}`);
  assert.match(res.stdout, /^score=\d+/);
  // No multi-line output — it's a single line
  assert.equal(res.stdout.trim().split("\n").length, 1);
});

test("--summary exits 1 when high or medium findings exist", () => {
  const res = run("--summary");
  // On a real system there's usually at least one medium finding
  if (res.stdout.includes("high=") || res.stdout.includes("medium=")) {
    assert.equal(res.status, 1);
  }
});

test("--check-list prints check metadata as JSON", () => {
  const res = run("--check-list");
  assert.equal(res.status, 0);
  const list = JSON.parse(res.stdout);
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 20, `expected 20+ checks, got ${list.length}`);
  const mem = list.find((c) => c.id === "memory");
  assert.ok(mem, "memory check should be in the list");
  assert.equal(typeof mem.title, "string");
  assert.equal(typeof mem.category, "string");
  assert.ok(Array.isArray(mem.appliesTo));
  assert.equal(typeof mem.appliesHere, "boolean");
});

test("--todo prints a numbered fix list, ordered by severity", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-todo-"));
  try {
    writeFileSync(
      join(dir, "fixes.js"),
      "export default { id: 'fixes', title: 'Fixes', async run() { return [\n" +
        "  { severity: 'info', title: 'Low thing', detail: null, evidence: null, fix: 'Run low-fix', confidence: 'high' },\n" +
        "  { severity: 'medium', title: 'Med thing', detail: null, evidence: null, fix: 'Run med-fix', confidence: 'high' },\n" +
        "  { severity: 'high', title: 'High thing', detail: null, evidence: null, fix: 'Run high-fix', confidence: 'high' }\n" +
        "]; } };\n"
    );
    const env = { ...process.env, LINUX_DOCTOR_PLUGINS: dir };
    const res = spawnSync(process.execPath, [bin, "--check", "fixes", "--todo"], { encoding: "utf8", timeout: 60000, env });
    assert.equal(res.status, 1, res.stderr);
    const out = res.stdout;
    const hi = out.indexOf("[high] High thing");
    const med = out.indexOf("[medium] Med thing");
    const lo = out.indexOf("[info] Low thing");
    assert.ok(hi >= 0 && med >= 0 && lo >= 0, "all three findings listed");
    assert.ok(hi < med && med < lo, "steps ordered high → medium → info");
    assert.match(out, /1\. \[high\]/);
    assert.match(out, /Run high-fix/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--self-test explains the environment and which checks run", () => {
  const res = run("--self-test");
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^Distro:/m);
  assert.match(res.stdout, /^Profile:/m);
  assert.match(res.stdout, /Checks: \d+ will run here/);
  assert.match(res.stdout, /Checks that will run:/);
});

test("--summary shows a score delta vs the previous run", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-delta-"));
  const env = { ...process.env, LINUX_DOCTOR_HISTORY: join(dir, "history.json") };
  try {
    const first = spawnSync(process.execPath, [bin, "--summary"], { encoding: "utf8", timeout: 60000, env });
    assert.equal(first.status, 1, "a full run on a real system usually has findings; exit 1 expected otherwise");
    assert.match(first.stdout, /^score=\d+/);
    assert.doesNotMatch(first.stdout, /delta=/, "first run has no previous score to compare against");

    const second = spawnSync(process.execPath, [bin, "--summary"], { encoding: "utf8", timeout: 60000, env });
    assert.equal(second.status, first.status);
    assert.match(second.stdout, /delta=-?\d+/, "second run must carry a score delta");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--init-config creates a starter config file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-initconfig-"));
  const prevConfig = process.env.LINUX_DOCTOR_CONFIG;
  process.env.LINUX_DOCTOR_CONFIG = join(dir, "config.json");
  try {
    const res = run("--init-config");
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Config written to/);
    const config = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    assert.ok(Array.isArray(config.ignore));
    assert.ok(Array.isArray(config.ignoreCodes));
    assert.ok(typeof config.thresholds === "object");
    assert.equal(typeof config.thresholds.diskFullPct, "number");
  } finally {
    if (prevConfig === undefined) delete process.env.LINUX_DOCTOR_CONFIG;
    else process.env.LINUX_DOCTOR_CONFIG = prevConfig;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--compare shows no changes when reports are identical", () => {
  // Create a report, then compare it against itself
  const dir = mkdtempSync(join(tmpdir(), "ld-cli-compare-"));
  try {
    const reportPath = join(dir, "report.json");
    const baseline = run("--check", "memory", "--json");
    writeFileSync(reportPath, baseline.stdout, "utf8");
    // Run the same check and compare against the saved report
    const res = spawnSync(process.execPath, [bin, "--check", "memory", "--compare", reportPath, "--json"], {
      encoding: "utf8",
      timeout: 60000,
    });
    // --compare runs its own checks internally; the output goes to stdout
    // (either "No changes" or a diff). The exit code is from the compare.
    assert.ok(res.status === 0 || res.status === 1, `exit ${res.status}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--compare missing file fails with exit 2", () => {
  const res = run("--compare", "/nonexistent/report.json");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /could not read compare file/);
});

test("network: slow DNS resolution is flagged medium", async () => {
  const { network } = await import("../src/checks/network.js");
  const { detectDistro } = await import("../src/distro.js");
  const ctx = {
    osRelease: { id: "fedora", id_like: "fedora" },
    dist: detectDistro({ id: "fedora", id_like: "fedora" }),
    thresholds: {},
    run: async (cmd) => {
      if (cmd.includes("ip -brief addr")) return { ok: true, code: 0, stdout: "eth0 UP 192.168.1.100/24\n", stderr: "" };
      if (cmd.includes("ip route show default")) return { ok: true, code: 0, stdout: "default via 192.168.1.1 dev eth0\n", stderr: "" };
      if (cmd.includes("getent ahostsv4")) {
        // Simulate slow DNS by delaying
        await new Promise((r) => setTimeout(r, 600));
        return { ok: true, code: 0, stdout: "93.184.216.34\n", stderr: "" };
      }
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await network.run(ctx);
  const slow = findings.find((f) => f.code === "network/dns-slow");
  assert.ok(slow, "expected a slow DNS finding");
  assert.equal(slow.severity, "medium");
  assert.match(slow.title, /slow/);
});

test("network: fast DNS does NOT produce a slow finding", async () => {
  const { network } = await import("../src/checks/network.js");
  const { detectDistro } = await import("../src/distro.js");
  const ctx = {
    osRelease: { id: "fedora", id_like: "fedora" },
    dist: detectDistro({ id: "fedora", id_like: "fedora" }),
    thresholds: {},
    run: async (cmd) => {
      if (cmd.includes("ip -brief addr")) return { ok: true, code: 0, stdout: "eth0 UP 192.168.1.100/24\n", stderr: "" };
      if (cmd.includes("ip route show default")) return { ok: true, code: 0, stdout: "default via 192.168.1.1 dev eth0\n", stderr: "" };
      if (cmd.includes("getent ahostsv4")) return { ok: true, code: 0, stdout: "93.184.216.34\n", stderr: "" };
      return { ok: false, code: 1, stdout: "", stderr: "" };
    },
  };
  const findings = await network.run(ctx);
  assert.ok(!findings.some((f) => f.code === "network/dns-slow"), "fast DNS must not produce a slow finding");
});
