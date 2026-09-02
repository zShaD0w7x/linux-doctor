import { test } from "node:test";
import assert from "node:assert/strict";
import { gpuUsage } from "../src/checks/gpu-usage.js";
import { parseArgs } from "../src/args.js";
import { detectDistro } from "../src/distro.js";
import { loadThresholds } from "../src/thresholds.js";

function stubCtx(map, osRelease = { id: "fedora", id_like: "fedora" }) {
  return {
    osRelease,
    dist: detectDistro(osRelease),
    thresholds: loadThresholds({}),
    run: async (cmd) => {
      const entry = map[cmd] ?? map[cmd.replaceAll("'", "")];
      if (entry === undefined) return { ok: false, code: 1, stdout: "", stderr: "" };
      return { ok: true, code: 0, stdout: entry, stderr: "" };
    },
  };
}

const AMD_CMD =
  "for d in /sys/class/drm/card*/device; do u=$(cat $d/mem_info_vram_used 2>/dev/null); t=$(cat $d/mem_info_vram_total 2>/dev/null); [ -n \"$u\" ] && [ -n \"$t\" ] && echo \"amd $u $t\"; done 2>/dev/null";

// ----------------------------------------------------------- gpu-usage -----------------------------------------------------------

test("gpu-usage: a nearly-full NVIDIA VRAM is medium", async () => {
  const ctx = stubCtx({
    "command -v nvidia-smi 2>/dev/null": "/usr/bin/nvidia-smi\n",
    "nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null": "24000, 24564\n",
  });
  const findings = await gpuUsage.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.equal(findings[0].code, "gpu-usage/vram-full");
});

test("gpu-usage: a moderately-loaded NVIDIA VRAM is informational", async () => {
  const ctx = stubCtx({
    "command -v nvidia-smi 2>/dev/null": "/usr/bin/nvidia-smi\n",
    "nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null": "14000, 24564\n",
  });
  const findings = await gpuUsage.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "info");
  assert.equal(findings[0].code, "gpu-usage/active");
});

test("gpu-usage: an idle NVIDIA VRAM stays silent", async () => {
  const ctx = stubCtx({
    "command -v nvidia-smi 2>/dev/null": "/usr/bin/nvidia-smi\n",
    "nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null": "500, 24564\n",
  });
  const findings = await gpuUsage.run(ctx);
  assert.equal(findings.length, 0);
});

test("gpu-usage: AMD VRAM read from sysfs (no tool) reports correctly", async () => {
  const ctx = stubCtx({
    "command -v nvidia-smi 2>/dev/null": "",
    [AMD_CMD]: "amd 8000000000 8589934592\n", // ~93% → medium
  });
  const findings = await gpuUsage.run(ctx);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].evidence, /AMD GPU0/);
});

test("gpu-usage: no detectable GPU stays silent", async () => {
  const ctx = stubCtx({
    "command -v nvidia-smi 2>/dev/null": "",
    [AMD_CMD]: "",
  });
  const findings = await gpuUsage.run(ctx);
  assert.equal(findings.length, 0);
});

// ----------------------------------------------------------- --ai-local -----------------------------------------------------------

test("--ai-local is a recognized boolean flag and sets aiLocal", () => {
  const out = parseArgs(["node", "linux-doctor", "--ai-local"]);
  assert.equal(out.aiLocal, true);
});

test("--ai-local does not require a value (unlike --push)", () => {
  const out = parseArgs(["node", "linux-doctor", "--ai-local", "--check", "memory"]);
  assert.equal(out.aiLocal, true);
  assert.deepEqual(out.checkIds, ["memory"]);
});
