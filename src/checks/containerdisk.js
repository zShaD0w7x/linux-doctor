import { defineCheck } from "./define.js";
import { parseSize } from "../utils.js";
import { finding } from "../findings.js";

/**
 * Container storage: Podman/Docker image storage fills disks silently —
 * especially common on developer machines and build servers. Read-only.
 * Parses the plain-text output of `podman system df` / `docker system df`
 * so it works across versions without relying on --format json.
 */
export const containerdisk = defineCheck({
  id: "containerdisk",
  title: "Container storage",
  category: "system",
  async run(ctx) {
    const findings = [];
    const t = ctx.thresholds;

    const podman = await ctx.run("podman system df 2>/dev/null");
    const docker = !podman.ok
      ? await ctx.run("docker system df 2>/dev/null")
      : { ok: false };

    const df = podman.ok ? podman : docker.ok ? docker : null;
    const runtime = podman.ok ? "podman" : docker.ok ? "docker" : null;

    if (!runtime) {
      findings.push(finding({
        severity: "info",
        code: "containerdisk/skipped",
        title: "Container storage check skipped",
        detail: "Neither `podman` nor `docker` is installed, so container storage could not be checked.",
        evidence: "podman: not found · docker: not found",
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    // Parse the images line: "Images   N   N   1.2GB   800MB (66%)"
    const imageLine = df.stdout.split("\n").find((l) => /^\s*images\b/i.test(l));
    if (!imageLine) return findings;

    const parts = imageLine.split(/\s+/);
    // parts: [Images, total, active, size, reclaimable, (pct)]
    const sizeStr = parts[3] || "0";
    const reclaimStr = parts[4] || "0";
    const totalBytes = parseSize(sizeStr);
    const reclaimBytes = parseSize(reclaimStr);

    const GB = (b) => (b / 1024 ** 3).toFixed(1);
    const reclaimPct = totalBytes > 0 ? Math.round((reclaimBytes / totalBytes) * 100) : 0;

    // Thresholds: container image storage
    const warnGB = (t.containerWarnGB) || 20;
    const highGB = (t.containerHighGB) || 50;

    if (totalBytes >= highGB * 1024 ** 3) {
      findings.push(finding({
        severity: "high",
        code: "containerdisk/high",
        title: `Container image storage is very large (${GB(totalBytes)} GB)`,
        detail: `${runtime} is using ${GB(totalBytes)} GB for images, of which ${GB(reclaimBytes)} GB (${reclaimPct}%) can be reclaimed. Large image caches fill disks and slow down builds.`,
        evidence: imageLine.trim(),
        fix: `Run \`${runtime} image prune -a\` to remove unused images, or \`${runtime} system prune\` to also remove stopped containers and unused volumes.`,
        confidence: "high",
      }));
    } else if (totalBytes >= warnGB * 1024 ** 3) {
      findings.push(finding({
        severity: "medium",
        code: "containerdisk/warn",
        title: `Container image storage is getting large (${GB(totalBytes)} GB)`,
        detail: `${runtime} is using ${GB(totalBytes)} GB for images, of which ${GB(reclaimBytes)} GB (${reclaimPct}%) can be reclaimed. Container images are a common hidden cause of full disks.`,
        evidence: imageLine.trim(),
        fix: `Run \`${runtime} image prune -a\` to remove unused images.`,
        confidence: "high",
      }));
    } else if (totalBytes > 0) {
      findings.push(finding({
        severity: "info",
        code: "containerdisk/ok",
        title: `Container image storage is fine (${GB(totalBytes)} GB)`,
        detail: `${runtime} is using ${GB(totalBytes)} GB for images.`,
        evidence: imageLine.trim(),
        fix: null,
        confidence: "high",
      }));
    }

    return findings;
  },
});
