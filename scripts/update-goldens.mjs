#!/usr/bin/env node
/**
 * Controlled golden-snapshot regeneration.
 *
 * `npm run goldens:update` re-renders every scenario/channel through the SAME
 * harness the test uses (tests/golden/scenarios.mjs) and overwrites the
 * committed snapshots. Run it ONLY when an output change is intentional, then
 * review the git diff as the human-readable record of what changed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { SCENARIOS, renderChannels } from "../tests/golden/scenarios.mjs";

const SNAPSHOTS = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "golden", "snapshots");
mkdirSync(SNAPSHOTS, { recursive: true });

for (const state of Object.keys(SCENARIOS)) {
  const channels = await renderChannels(state);
  for (const [channel, text] of Object.entries(channels)) {
    const file = join(SNAPSHOTS, `${state}.${channel}.txt`);
    writeFileSync(file, text);
    console.log(`wrote ${file}`);
  }
}
console.log("\nDone. Review with: git diff tests/golden/snapshots/");
