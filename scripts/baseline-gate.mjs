// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Clean-image baseline gate.
 *
 * Runs the real engine inside a distro image and fails when a high or medium
 * finding appears that the baseline does not already account for. The point is
 * not to keep containers clean — a bare container legitimately has no firewall,
 * no backup tool and no journal — it is to make a *new* false positive
 * impossible to land silently.
 *
 * The suite has shipped this class of bug twice: `fs/btrfs-errors` fired on the
 * btrfs module load banner (#13) and `hardware/ecc` fired on the EDAC driver's
 * "No ECC support" init line (#16). Both looked like real hardware faults on a
 * healthy machine, and both would have been caught here on the first run.
 *
 * Usage:
 *   node scripts/baseline-gate.mjs tests/baseline/<id>.json          # check
 *   node scripts/baseline-gate.mjs tests/baseline/<id>.json --write  # refresh
 *
 * A refreshed entry that has no reason is written as `TODO: ...` and the gate
 * refuses to pass while any TODO remains. Adding a finding to the baseline is a
 * deliberate act ("this one is expected in a container"), never a rubber stamp.
 *
 * Codes whose truth depends on the host rather than the image — memory, load,
 * kernel OOM/crash events, pending updates, a missing default route — are
 * tolerated in both directions (see ENVIRONMENT). They are never pinned, so the
 * gate does not flap with whatever else the CI runner happens to be doing.
 *
 * Exit codes: 0 clean · 1 unexpected finding (or unjustified baseline entry)
 *             2 a hardware-fault code fired on a clean image · 3 check errors
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Codes that must never appear on a clean image, whatever the baseline says.
 * A bare container has no ECC memory to correct and no mounted filesystem to
 * corrupt, so one of these firing is the check lying about the machine. If a
 * baseline ever lists one, that is a bug in the baseline, not a permission.
 */
const NEVER_ON_CLEAN = [
  "hardware/ecc",
  "hardware/mce",
  "fs/btrfs-errors",
  "fs/readonly-remount",
  "smart/failing",
];

/**
 * Codes whose truth depends on the *host* or on today's repos, not on the
 * image, so they are tolerated instead of pinned. `memory/low` is the clearest
 * case: inside a container it reads the host's memory, so pinning it would make
 * the gate flap with whatever else the CI runner is doing. These are ignored in
 * both directions — they never need a baseline entry and never fail the gate.
 * Everything outside this set must be justified in the baseline, which is how
 * `packages/broken` was caught firing on a clean Arch image.
 */
const ENVIRONMENT = new Set([
  "memory/low", // reads the host/cgroup, not the image
  "load/busy", // ditto
  "load/overloaded", // ditto
  "oom/kills", // host kernel events
  "crash/coredumps", // host kernel events
  "updates/pending", // depends on what the distro repos look like today
  "network/no-route", // a bare container has no default route
]);

const TODO = "TODO";

const args = process.argv.slice(2);
const write = args.includes("--write");
const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  console.error("usage: node scripts/baseline-gate.mjs tests/baseline/<id>.json [--write]");
  process.exit(64);
}

const file = resolve(target);
const image = process.env.BASELINE_IMAGE || file.replace(/^.*\/baseline\//, "").replace(/\.json$/, "");

// History off: a CI container must not carry state between runs. The updates
// cache is disabled the same way, so every run really re-probes the image.
const run = spawnSync(process.execPath, ["bin/doctor.js", "--json", "--no-history"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, LINUX_DOCTOR_UPDATES_TTL_MS: "0" },
});

if (!run.stdout || !run.stdout.trim().startsWith("{")) {
  console.error(`baseline-gate: the engine produced no JSON report (status ${run.status})`);
  if (run.stderr) console.error(run.stderr.trim().split("\n").slice(-5).join("\n"));
  process.exit(3);
}

const report = JSON.parse(run.stdout);
const checkErrors = report.checkErrors ?? [];
if (checkErrors.length) {
  console.error(`baseline-gate: ${checkErrors.length} check(s) threw on ${image}:`);
  for (const e of checkErrors) console.error(`  ${e.check}: ${e.message ?? e.error ?? JSON.stringify(e)}`);
  process.exit(3);
}

const findings = (report.findings ?? []).filter((f) => f.severity === "high" || f.severity === "medium");
const observed = new Map();
for (const f of findings) if (!observed.has(f.code)) observed.set(f.code, f);

const infoCount = (report.findings ?? []).length - findings.length;

if (write) {
  const previous = readBaseline(file, { quiet: true });
  const expected = {};
  for (const [code, f] of [...observed].sort()) {
    if (ENVIRONMENT.has(code)) continue; // host-dependent: never pinned
    const kept = previous?.expected?.[code];
    expected[code] =
      kept && !kept.startsWith(TODO)
        ? kept
        : `${TODO}: does ${code} belong on a clean ${image} (${f.severity})? Say why, or fix the check.`;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      {
        image,
        captured: new Date().toISOString().slice(0, 10),
        note: "High/medium findings this image is allowed to produce. Every entry needs a reason. Codes whose truth depends on the host (memory/load/updates) are tolerated by the gate and never listed here.",
        expected,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`baseline-gate: wrote ${target} — ${Object.keys(expected).length} expected code(s)`);
  for (const code of Object.keys(expected)) console.log(`  ${code}`);
  const envSeen = [...observed.keys()].filter((c) => ENVIRONMENT.has(c));
  if (envSeen.length) console.log(`  tolerated (host-dependent, not pinned): ${envSeen.join(", ")}`);
  const unchanged = previous?.expected
    ? Object.keys(previous.expected).filter((c) => !(c in expected))
    : [];
  if (unchanged.length) console.log(`  no longer fires: ${unchanged.join(", ")}`);
  process.exit(0);
}

const baseline = readBaseline(file);
const expected = baseline.expected ?? {};

const unjustified = Object.entries(expected)
  .filter(([, reason]) => typeof reason !== "string" || reason.startsWith(TODO))
  .map(([code]) => code);
const never = [...observed.keys()].filter((code) => NEVER_ON_CLEAN.includes(code));
const unexpected = [...observed.entries()].filter(([code]) => !(code in expected) && !ENVIRONMENT.has(code));
const stale = Object.keys(expected).filter((code) => !observed.has(code));

let failed = false;

if (never.length) {
  failed = true;
  console.error(`baseline-gate: ${never.length} hardware-fault code(s) fired on a clean ${image}:`);
  for (const code of never) {
    const f = observed.get(code);
    console.error(`  ${code} [${f.severity}] ${f.title}`);
    if (f.evidence) console.error(`    evidence: ${String(f.evidence).split("\n")[0]}`);
    console.error("    this is the false-positive class: the image cannot have this fault, so the check is wrong");
  }
}

if (unexpected.length) {
  failed = true;
  console.error(`baseline-gate: ${unexpected.length} finding(s) not in ${target}:`);
  for (const [code, f] of unexpected) {
    console.error(`  ${code} [${f.severity}] ${f.title}`);
    if (f.evidence) console.error(`    evidence: ${String(f.evidence).split("\n")[0]}`);
  }
  console.error("  if the check is wrong, fix it. If a clean container really does have this,");
  console.error(`  re-run with --write and justify the entry in ${target}.`);
}

if (unjustified.length) {
  failed = true;
  console.error(`baseline-gate: ${unjustified.length} baseline entry(ies) still carry a TODO reason:`);
  for (const code of unjustified) console.error(`  ${code}`);
  console.error(`  edit ${target} and say why each one is expected on a clean image.`);
}

if (stale.length) {
  // Not a failure: an image update can add the tool that used to be missing.
  // Still reported, because a stale entry is a claim we are no longer testing.
  console.log(`baseline-gate: note — ${stale.length} baseline entr(y/ies) no longer fire: ${stale.join(", ")}`);
}

if (failed) process.exit(never.length ? 2 : 1);

console.log(
  `baseline-gate: ${image} ok — ${Object.keys(expected).length} expected high/medium code(s), ` +
    `${findings.length} observed (${[...observed.keys()].filter((c) => ENVIRONMENT.has(c)).length} host-dependent tolerated), ` +
    `${infoCount} info ignored`,
);

function readBaseline(path, { quiet = false } = {}) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (quiet) return null;
    console.error(`baseline-gate: cannot read ${path}: ${err.message}`);
    console.error("  generate it inside the image with --write (see the file header).");
    process.exit(64);
  }
}
