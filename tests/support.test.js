import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSupportBundle,
  writeSupportBundle,
  defaultBundlePath,
  supportMessage,
  scrub,
  PRIVACY_EXCLUDED,
  BUNDLE_HISTORY_LIMIT,
} from "../src/support.js";

test("scrub: redacts IPv4 and IPv6 literals", () => {
  assert.equal(scrub("connected to 192.168.1.42 port 22"), "connected to <ip-redacted> port 22");
  assert.equal(scrub("peer fe80::1ff:fe23:4567:890a up"), "peer <ip-redacted> up");
  assert.equal(scrub(null), null);
  assert.equal(scrub("no address here"), "no address here");
});

test("scrub: redacts home-directory usernames but keeps path context", () => {
  assert.equal(scrub("config at /home/alice/.config/linux-doctor/config.json"), "config at /home/<user-redacted>/.config/linux-doctor/config.json");
  assert.equal(scrub("/Users/bob/Library/Logs/app.log"), "/Users/<user-redacted>/Library/Logs/app.log");
  // /home itself (no user segment) is untouched; /run/user/<uid> is redacted.
  assert.equal(scrub("/home is a mountpoint"), "/home is a mountpoint");
  assert.equal(scrub("XDG_RUNTIME_DIR=/run/user/1000/bus"), "XDG_RUNTIME_DIR=/run/user/<uid-redacted>/bus");
});

test("buildSupportBundle: privacy-safe system subset and metadata", () => {
  const b = buildSupportBundle({
    system: { distro: "Fedora 40", family: "fedora", kernel: "6.8.9", cores: "4", uptime: "1h", immutable: true, imageBased: true, atomicVariant: "bazzite", osRelease: { SECRET: "x" } },
    findings: [],
    score: 80,
  });
  assert.equal(b.kind, "support-bundle");
  assert.equal(b.tool, "linux-doctor");
  assert.equal(b.score, 80);
  assert.deepEqual(Object.keys(b.system).sort(), ["atomicVariant", "cores", "distro", "family", "imageBased", "immutable", "kernel", "uptime"]);
  assert.equal(b.system.osRelease, undefined, "raw os-release must never be included");
  assert.deepEqual(b.privacy.excluded, PRIVACY_EXCLUDED);
});

test("buildSupportBundle: findings are scrubbed, history tail is codes-only", () => {
  const b = buildSupportBundle({
    system: { distro: "Fedora", family: "fedora", kernel: "6.8", cores: "4", uptime: "1h" },
    findings: [{ title: "ssh from 10.0.0.5", detail: "saw 10.0.0.5", evidence: "log 10.0.0.5", fix: "reboot" }],
    history: [
      { at: "t1", score: 90, counts: { high: 1 } },
      { at: "t2", score: 85, counts: { high: 0 }, findings: [{ code: "x" }] },
    ],
  });
  assert.equal(b.findings[0].title, "ssh from <ip-redacted>");
  assert.equal(b.findings[0].evidence, "log <ip-redacted>");
  assert.equal(b.history.length, 2);
  // only score/counts carried over — not the historical findings
  assert.equal(b.history[0].findings, undefined);
});

test("buildSupportBundle: history tail is capped at BUNDLE_HISTORY_LIMIT", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ at: String(i), score: i }));
  const b = buildSupportBundle({ system: { distro: "d", family: "f", kernel: "k", cores: "1", uptime: "1h" }, history });
  assert.equal(b.history.length, BUNDLE_HISTORY_LIMIT);
  assert.equal(b.history[b.history.length - 1].at, "19");
});

test("writeSupportBundle: writes a valid JSON file atomically", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-sup-"));
  try {
    const bundle = buildSupportBundle({ system: { distro: "d", family: "f", kernel: "k", cores: "1", uptime: "1h" } });
    const path = join(dir, "bundle.json");
    const written = writeSupportBundle(bundle, path);
    assert.equal(written, path);
    assert.equal(existsSync(path), true);
    assert.equal(existsSync(`${path}.tmp`), false, "no temp residue");
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(parsed.kind, "support-bundle");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeSupportBundle: returns null when it cannot write", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-sup-"));
  const blocker = join(dir, "blocker");
  try {
    // A blocker *file* as the parent path forces ENOTDIR (matches history.js's
    // own unwritable-location test) so we exercise the null-return path.
    writeFileSync(blocker, "");
    const file = join(blocker, "bundle.json");
    assert.equal(writeSupportBundle({ kind: "support-bundle" }, file), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("defaultBundlePath: timestamped name in the given dir", () => {
  const p = defaultBundlePath("/tmp/x");
  assert.ok(p.startsWith("/tmp/x/linux-doctor-support-"));
  assert.ok(p.endsWith(".json"));
});

test("supportMessage: tells the user what to do with the file", () => {
  const m = supportMessage("/tmp/b.json");
  assert.ok(m.includes("/tmp/b.json"));
  assert.ok(/forum|issue|support/i.test(m));
});
