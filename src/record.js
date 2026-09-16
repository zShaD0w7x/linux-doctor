// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Command recorder — captures a real machine's command outputs so a run can be
 * replayed later as a regression fixture.
 *
 * Enabled with `LINUX_DOCTOR_RECORD=<path>`, which is a contribution tool, not
 * part of the normal surface: it changes nothing a check sees (the wrapper
 * returns the same result the real run would), and it only ever writes one file.
 *
 * Why this exists: the engine's answers depend on what real tools print on real
 * distros, which no test can invent. A recorded fixture is a machine we can
 * re-run forever — the standard clean-image gate in CI covers bare containers,
 * this covers the desktop and laptop cases those images cannot represent.
 *
 * Privacy: every captured stdout/stderr is scrubbed before it is written —
 * IP addresses and home paths by support.scrub(), plus the hostname, username,
 * MAC addresses, UUIDs, 32-hex machine ids, serial numbers and email addresses.
 * That is best effort, not a guarantee: fixtures are reviewed before they are
 * committed (tests/fixtures-privacy.test.js is the backstop).
 */
import os from "node:os";
import { readFileSync } from "node:fs";

import { atomicWrite } from "./fsx.js";
import { scrub } from "./support.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

/** The `LINUX_DOCTOR_RECORD` target, or null when recording is off. */
export function recordPath(env = process.env) {
  const raw = env.LINUX_DOCTOR_RECORD;
  return raw && raw.trim() ? raw.trim() : null;
}

function currentHost() {
  try {
    return os.hostname();
  } catch {
    return null;
  }
}

function currentUser() {
  try {
    return os.userInfo().username;
  } catch {
    return null;
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Extra redactions a recorded command output needs beyond support.scrub().
 * The hostname and username are known at capture time, so they are replaced
 * literally rather than by pattern — a journal line reads "bazzite kernel: ..."
 * and the account name appears in `ps`, `who`, and path listings.
 */
export function scrubRecord(text, { hostname = currentHost(), user = currentUser() } = {}) {
  if (!text) return text;
  let out = scrub(String(text));
  if (hostname && hostname.length >= 3) {
    out = out.replace(new RegExp(escapeRe(hostname), "gi"), "<host-redacted>");
  }
  if (user && user.length >= 3) {
    out = out.replace(new RegExp(`\\b${escapeRe(user)}\\b`, "g"), "<user-redacted>");
  }
  return (
    out
      .replace(/\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/gi, "<mac-redacted>")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid-redacted>")
      .replace(/\b[0-9a-f]{32}\b/gi, "<id-redacted>")
      .replace(/(\b(?:serial|SERIAL)(?:\s+number)?\s*[:=]\s*)\S+/g, "$1<serial-redacted>")
      .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g, "<email-redacted>")
  );
}

/**
 * A cassette key: a command string with the same redactions applied. Commands
 * embed device paths ("/sys/firmware/efi/efivars/SecureBoot-<guid>",
 * /dev/disk/by-uuid/...) so the key is as leak-prone as the output it produced.
 * Both sides of the cassette use this — the recorder writes scrubbed keys, and
 * the replay scrubs the incoming command before the lookup — so a command still
 * finds its recorded result on a machine with a different hostname and user.
 */
export function keyify(cmd, opts = {}) {
  return scrubRecord(cmd, opts);
}

/**
 * Wrap a run() so every result is also collected, keyed by command. Repeated
 * calls keep their order in a list, since a check may probe the same command
 * more than once and the replay must hand back the same sequence.
 */
export function createRecorder(baseRun, redactOptions = {}) {
  const commands = new Map();
  let calls = 0;

  const run = async (cmd, opts) => {
    const res = await baseRun(cmd, opts);
    const key = keyify(cmd, redactOptions);
    const list = commands.get(key) ?? [];
    list.push(res);
    commands.set(key, list);
    calls += 1;
    return res;
  };

  /**
   * Build and write the fixture for a finished report. The `expected` map is
   * seeded with TODO reasons on purpose: like the baseline gate, a recorded
   * finding has to be justified by hand before the test will pass, so a false
   * positive cannot be enshrined by re-recording.
   */
  const write = (path, { report }) => {
    const system = report.system ?? {};
    const cassette = {};
    for (const [cmd, list] of commands) {
      cassette[cmd] = list.map((r) => ({
        ok: !!r.ok,
        code: typeof r.code === "number" ? r.code : r.ok ? 0 : 1,
        ...(r.missing ? { missing: true } : {}),
        ...(r.timedOut ? { timedOut: true } : {}),
        ...(r.truncated ? { truncated: true } : {}),
        stdout: scrubRecord(r.stdout ?? "", redactOptions),
        stderr: scrubRecord(r.stderr ?? "", redactOptions),
      }));
    }

    const expected = {};
    for (const f of report.findings ?? []) {
      if (f.severity !== "high" && f.severity !== "medium") continue;
      if (f.code in expected) continue;
      expected[f.code] = `TODO: does ${f.code} belong on this machine (${f.severity})? Say why, or fix the check.`;
    }

    const fixture = {
      schemaVersion: 1,
      kind: "linux-doctor-fixture",
      captured: new Date().toISOString().slice(0, 10),
      tool: pkg.version,
      system: {
        distro: system.distro,
        family: system.family,
        kernel: system.kernel,
        kind: system.kind,
        immutable: !!system.immutable,
        imageBased: !!system.imageBased,
        atomicVariant: system.atomicVariant ?? null,
        osRelease: system.osRelease,
      },
      note: "Recorded from a real machine with LINUX_DOCTOR_RECORD. Outputs are scrubbed (host, user, IP, MAC, UUID, serial, email) but review the diff before committing.",
      commands: cassette,
      expected,
    };

    return atomicWrite(path, JSON.stringify(fixture, null, 2) + "\n") ? path : null;
  };

  return {
    run,
    write,
    get calls() {
      return calls;
    },
    get commandCount() {
      return commands.size;
    },
  };
}

/**
 * Build a replaying run() from a fixture's cassette. Never throws: a command
 * the fixture did not record resolves like a missing tool (ok:false, no output),
 * which is exactly what the engine does on a machine without it — and any
 * resulting change in findings shows up as a fixture failure rather than a
 * crash. Repeated commands are handed back in recorded order; once exhausted,
 * the last recorded result repeats (some checks poll the same probe).
 */
export function cassetteRun(cassette = {}) {
  const cursors = new Map();
  return async (cmd) => {
    const key = keyify(cmd);
    const list = cassette[key];
    if (!Array.isArray(list) || list.length === 0) {
      return { ok: false, code: 1, stdout: "", stderr: "", missing: true };
    }
    const i = cursors.get(key) ?? 0;
    cursors.set(key, i + 1);
    const entry = list[Math.min(i, list.length - 1)];
    return {
      ok: !!entry.ok,
      code: typeof entry.code === "number" ? entry.code : entry.ok ? 0 : 1,
      stdout: entry.stdout ?? "",
      stderr: entry.stderr ?? "",
      ...(entry.missing ? { missing: true } : {}),
      ...(entry.timedOut ? { timedOut: true } : {}),
      ...(entry.truncated ? { truncated: true } : {}),
    };
  };
}
