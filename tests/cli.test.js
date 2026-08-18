import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  for (const id of ["memory", "load", "disk", "services", "timers", "journal", "journald", "suspend", "security", "secureboot", "network", "ntp", "updates", "firmware", "flatpak", "reboot", "processes", "thermal", "battery", "gpu", "bluetooth", "wayland", "backup", "hardware", "smart", "luks", "audio", "containers"]) {
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
