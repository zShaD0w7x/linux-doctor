import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VALUE_FLAGS, BOOL_FLAGS } from "../src/args.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin", "doctor.js");

// Every flag the parser accepts must surface everywhere a user discovers it.
const ALL_FLAGS = [...VALUE_FLAGS, ...BOOL_FLAGS, "--help", "--version"];

test("--help lists every flag the parser accepts", () => {
  const res = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8", timeout: 60000 });
  assert.equal(res.status, 0);
  for (const flag of ALL_FLAGS) {
    assert.ok(res.stdout.includes(flag), `--help must mention ${flag}`);
  }
});

test("shell completions mention every flag (no drift)", () => {
  const expectations = {
    bash: (flag) => flag, // flags live in the compgen string as "--flag"
    zsh: (flag) => flag,  // flags live in the _arguments specs as "--flag"
    fish: (flag) => `-l ${flag.slice(2)}`, // fish writes "-l flag"
  };
  for (const [shell, needle] of Object.entries(expectations)) {
    const text = readFileSync(join(root, "completions", `linux-doctor.${shell}`), "utf8");
    for (const flag of ALL_FLAGS) {
      assert.ok(text.includes(needle(flag)), `${shell} completions must mention ${flag}`);
    }
  }
});