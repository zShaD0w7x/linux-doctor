import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * GPU memory pressure — the visibility homelab/AI-rig users actually want.
 * Reads VRAM used/total for NVIDIA (nvidia-smi) and AMD (amdgpu sysfs, no
 * tool needed) and reports how full it is. Read-only. A full VRAM is a real
 * risk for AI workloads (OOM when you load a larger model), but an idle GPU
 * is not worth a line — so we stay silent below 50% and only surface it when
 * something is actually using the card.
 */
const MIB = 1024 * 1024;

export const gpuUsage = defineCheck({
  id: "gpu-usage",
  title: "GPU memory pressure",
  category: "graphics",
  async run(ctx) {
    const gpus = [];

    // NVIDIA via nvidia-smi (MiB).
    const nv = await ctx.run("command -v nvidia-smi 2>/dev/null");
    if (nv.ok && nv.stdout.trim()) {
      const q = await ctx.run("nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null");
      if (q.ok) {
        lines(q.stdout).forEach((l) => {
          const m = l.match(/(\d+)\s*,\s*(\d+)/);
          if (m && Number(m[2]) > 0) gpus.push({ label: `NVIDIA GPU${gpus.length}`, used: Number(m[1]), total: Number(m[2]), unit: "MiB" });
        });
      }
    }

    // AMD via amdgpu sysfs (bytes), no tool required.
    if (gpus.length === 0) {
      const amd = await ctx.run(
        "for d in /sys/class/drm/card*/device; do u=$(cat $d/mem_info_vram_used 2>/dev/null); t=$(cat $d/mem_info_vram_total 2>/dev/null); [ -n \"$u\" ] && [ -n \"$t\" ] && echo \"amd $u $t\"; done 2>/dev/null"
      );
      if (amd.ok) {
        lines(amd.stdout).forEach((l) => {
          const m = l.match(/^amd\s+(\d+)\s+(\d+)$/);
          if (m && Number(m[2]) > 0) gpus.push({ label: `AMD GPU${gpus.length}`, used: Math.round(Number(m[1]) / MIB), total: Math.round(Number(m[2]) / MIB), unit: "MiB" });
        });
      }
    }

    if (gpus.length === 0) return []; // no detectable GPU — silent

    const rows = gpus.map((g) => ({ ...g, pct: Math.round((g.used / g.total) * 100) }));
    const maxPct = Math.max(...rows.map((r) => r.pct));

    const evidence = rows.map((r) => `${r.label}: ${r.used}/${r.total} MiB (${r.pct}%)`).join("\n");
    const detail = `VRAM usage across ${rows.length} GPU: ${evidence.replace(/\n/g, "; ")}.`;

    if (maxPct >= 90) {
      return [finding({
        severity: "medium",
        code: "gpu-usage/vram-full",
        title: `GPU VRAM nearly full (${maxPct}%)`,
        detail: `${detail} At this level there is little headroom left — loading a larger model or allocating more buffers will likely be killed by the OOM handler.`,
        evidence,
        fix: "Close the process holding the GPU (check `nvidia-smi` / `radeontop`), or free VRAM before starting a bigger workload. If this is expected during a long inference run, you can ignore it.",
        confidence: "high",
      })];
    }
    if (maxPct >= 50) {
      return [finding({
        severity: "info",
        code: "gpu-usage/active",
        title: `GPU VRAM in use (${maxPct}%)`,
        detail: `${detail} The GPU is doing real work — this is normal while a model, game, or compute job is running.`,
        evidence,
        fix: null,
        confidence: "high",
      })];
    }
    return []; // idle GPU — nothing to report
  },
});
