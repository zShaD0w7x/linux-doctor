// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Privacy backstop for recorded fixtures.
 *
 * A fixture is captured from a real machine, so it is the one test input that
 * can carry somebody's data into the repository. src/record.js scrubs hostname,
 * username, IP addresses, home paths, MAC addresses, UUIDs, machine ids, serial
 * numbers and emails before writing — this test is the independent check that
 * the scrubber actually did, on the fixtures that are committed.
 *
 * Deliberately narrow patterns: a broad "looks like an IP" rule would also match
 * version strings (5.4.4.0), and a test that cries wolf gets ignored. Private
 * ranges and CIDR forms are what a real leak would look like here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const LEAKS = [
  { name: "MAC address", re: /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/gi },
  { name: "UUID", re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { name: "32-hex machine id", re: /\b[0-9a-f]{32}\b/gi },
  { name: "email address", re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g },
  { name: "serial number value", re: /\bserial(?:\s+number)?\s*[:=]\s*(?!<serial-redacted>)\S+/gi },
  { name: "private IPv4", re: /\b(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.\d{1,3}\.\d{1,3}\b|\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g },
  { name: "CIDR address", re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}\b/g },
  { name: "unredacted home path", re: /\/home\/(?!<user-redacted>)[A-Za-z0-9._-]+/g },
];

const files = readdirSync(DIR).filter((f) => f.endsWith(".json") || f.endsWith(".json.gz"));

assert.ok(files.length > 0, "expected at least one recorded fixture in tests/fixtures/");

test("fixtures: committed recordings contain no personal data the scrubber should have removed", () => {
  const problems = [];
  for (const file of files) {
    const raw = readFileSync(join(DIR, file));
    const text = file.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
    for (const { name, re } of LEAKS) {
      const hits = text.match(new RegExp(re.source, re.flags)) ?? [];
      if (hits.length) problems.push(`${file}: ${name} ×${hits.length} (e.g. ${hits[0].slice(0, 60)})`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    `a fixture leaked something and must be re-recorded (or the scrubber extended):\n  ${problems.join("\n  ")}`,
  );
});
