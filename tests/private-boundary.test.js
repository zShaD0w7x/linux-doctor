// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Private-boundary guard.
 *
 * Some things must never reach the public repository: internal strategy,
 * incident notes, competitor analysis, the Pro plan, local-only tooling.
 * .gitignore covers the paths, but a .gitignore rule is a hint — `git add -f`
 * walks straight past it, and a file that was already tracked stays tracked
 * even after the rule is added.
 *
 * So the boundary is checked against what git actually tracks, not against the
 * ignore file. If something private ever lands, this suite fails and says which
 * path to remove (see docs/RELEASING.md for the history-rewrite procedure if it
 * was already pushed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";

/** Paths and name families that are internal by nature. */
export const PRIVATE_PATTERNS = [
  { what: "internal docs", re: /^internal\// },
  { what: "launch material", re: /^launch\// },
  { what: "the Pro plan", re: /^pro\// },
  { what: "the private Pro board", re: /^PRO_BOARD_PRIVATE\.md$/ },
  { what: "the clone watchlist", re: /^\.watchlist$/ },
  { what: "local-only tooling", re: /^scripts\/check-clones\.mjs$/ },
  { what: "a .private.md note", re: /(^|\/)[^/]*\.private\.md$/ },
  { what: "an internal-*.md note", re: /(^|\/)internal-[^/]*\.md$/ },
  { what: "a *-internal.md note", re: /(^|\/)[^/]*-internal\.md$/ },
];

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function hasGit() {
  try {
    git(["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false; // an npm tarball has no .git; the guard is meaningless there
  }
}

test("private boundary: nothing internal is tracked in git", { skip: !hasGit() && "no git checkout" }, () => {
  const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const offenders = [];
  for (const path of tracked) {
    for (const { what, re } of PRIVATE_PATTERNS) {
      if (re.test(path)) offenders.push(`${path} (${what})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `private material is tracked in git and must be removed from the index:\n  ${offenders.join("\n  ")}\n` +
      `  git rm --cached <path>  (and rewrite history if it was already pushed)`,
  );
});

test("private boundary: the ignore rules still cover the internal paths", { skip: !hasGit() && "no git checkout" }, () => {
  // A representative path per family: the point is that the rules work even if
  // a file is written outside the directory that used to hold it.
  const samples = [
    "internal/quality-doctrine.md",
    "launch/promotion/mastodon.md",
    "pro/index.mjs",
    "PRO_BOARD_PRIVATE.md",
    ".watchlist",
    "scripts/check-clones.mjs",
    "docs/quality-doctrine.private.md",
    "docs/internal-strategy.md",
    "docs/quality-internal.md",
  ];
  const notIgnored = [];
  for (const path of samples) {
    try {
      git(["check-ignore", "-q", path]);
    } catch {
      notIgnored.push(path);
    }
  }
  assert.deepEqual(notIgnored, [], `these paths are no longer ignored by .gitignore:\n  ${notIgnored.join("\n  ")}`);
});
