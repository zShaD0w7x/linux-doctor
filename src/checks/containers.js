import { defineCheck } from "./define.js";

/**
 * Container runtimes: is Podman or Docker installed, and is it usable?
 * Podman is daemonless, so "usable" means `podman info` succeeds; Docker
 * needs its daemon running. Read-only checks only (command -v / systemctl
 * is-active / podman info), and non-systemd hosts are never guessed about.
 */
export const containers = defineCheck({
  id: "containers",
  title: "Container runtimes",
  category: "software",
  async run(ctx) {
    const findings = [];
    const install = (tool) =>
      ctx.dist.pkg === "apt"
        ? `sudo apt install ${tool}`
        : ctx.dist.pkg === "pacman"
          ? `sudo pacman -S ${tool}`
          : ctx.dist.pkg === "zypper"
            ? `sudo zypper install ${tool}`
            : `sudo dnf install ${tool}`;

    const podmanRes = await ctx.run("command -v podman 2>/dev/null");
    const dockerRes = await ctx.run("command -v docker 2>/dev/null");
    const podmanPath = podmanRes.stdout.trim();
    const dockerPath = dockerRes.stdout.trim();

    if (!podmanPath && !dockerPath) {
      findings.push({
        severity: "info",
        title: "No container runtime installed",
        detail: "Neither Podman nor Docker is installed. Containers are optional — install one if you want to run containerized applications.",
        evidence: "podman: not found\ndocker: not found",
        fix: `${install("podman")}. Podman is daemonless and works with rootless containers out of the box.`,
        confidence: "high",
      });
      return findings;
    }

    const ready = [];
    if (dockerPath) {
      const act = await ctx.run("systemctl is-active docker 2>/dev/null");
      const st = act.stdout.trim();
      if (st === "active") {
        ready.push("docker");
      } else if (st === "inactive") {
        findings.push({
          severity: "medium",
          title: "Docker daemon is not running",
          detail: "Docker is installed but its daemon is stopped, so `docker` commands fail. This is usually just a service that is not enabled at boot.",
          evidence: `docker: ${dockerPath}\nsystemctl docker: ${st}`,
          fix: "Start it with `sudo systemctl enable --now docker`.",
          confidence: "high",
        });
      }
      // "unknown" (non-systemd) or "failed" → do not speculate.
    }

    if (podmanPath) {
      const info = await ctx.run("podman info >/dev/null 2>&1 && echo ok || echo fail");
      if (/^ok\s*$/.test(info.stdout)) {
        ready.push("podman");
      } else {
        findings.push({
          severity: "medium",
          title: "Podman cannot run containers",
          detail: "`podman info` failed, so Podman cannot manage containers right now. This is usually a storage or user-namespace problem.",
          evidence: `podman: ${podmanPath}\npodman info: ${info.stdout.trim()}`,
          fix: "Inspect `podman info` output and `journalctl --user -n 50`, and make sure user namespaces are enabled (`sysctl kernel.unprivileged_userns_clone` on some distros).",
          confidence: "medium",
        });
      }
    }

    if (ready.length > 0 && findings.length === 0) {
      findings.push({
        severity: "info",
        title: "Container runtimes are ready",
        detail: `${ready.join(" and ")} can run containers.`,
        evidence: `${ready.join(", ")}: usable`,
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
});
