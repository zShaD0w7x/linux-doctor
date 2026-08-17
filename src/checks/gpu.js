import { lines } from "../utils.js";
import { detectSoftwareRenderer } from "./shared.js";

import { defineCheck } from "./define.js";

export const gpu = defineCheck({
  id: "gpu",
  title: "Graphics / GPU",
  category: "hardware",
  appliesTo: ["desktop", "laptop"],
  async run(ctx) {
    const findings = [];
    const [lspci, lsmod, dri] = await Promise.all([
      ctx.run("lspci -nn 2>/dev/null | grep -iE 'vga|3d|display'"),
      ctx.run("lsmod 2>/dev/null | awk '{print $1}' | grep -iE '^(nvidia|nouveau|amdgpu|i915|xe)$'"),
      ctx.run("ls /dev/dri/ 2>/dev/null"),
    ]);

    const hardware = lines(lspci.stdout).join("\n");
    const loaded = lines(lsmod.stdout).join(" ");
    const hasDri = dri.ok && lines(dri.stdout).length > 0;

    const hasNvidia = /nvidia/i.test(hardware);
    const hasAmd = /amd|advanced micro devices/i.test(hardware);
    const hasIntel = /intel/i.test(hardware);
    const nvidiaMod = /\bnvidia\b/.test(loaded);
    const nouveauMod = /\bnouveau\b/.test(loaded);
    const amdMod = /\bamdgpu\b/.test(loaded);
    const intelMod = /\bi915\b|\bxe\b/.test(loaded);

    if (!lspci.ok) {
      findings.push({
        severity: "info",
        title: "GPU check skipped",
        detail: "`lspci` is not available, so we could not inspect the graphics hardware.",
        evidence: null,
        fix: null,
        confidence: "medium",
      });
      return findings;
    }

    if (!hasNvidia && !hasAmd && !hasIntel && !hasDri) {
      findings.push({
        severity: "info",
        title: "No GPU detected",
        detail: "No VGA/3D controller was found. This is normal on headless servers or virtual machines.",
        evidence: hardware || "(no output)",
        fix: null,
        confidence: "high",
      });
      return findings;
    }

    // NVIDIA is the most common source of pain, so it gets the detailed logic.
    if (hasNvidia) {
      if (nvidiaMod) {
        const ver = await ctx.run("cat /proc/driver/nvidia/version 2>/dev/null");
        findings.push({
          severity: "info",
          title: "NVIDIA proprietary driver is loaded",
          detail: "The NVIDIA proprietary driver is active, which is the right setup for gaming and CUDA workloads.",
          evidence: ver.ok && ver.stdout.trim() ? ver.stdout.trim() : "module: nvidia",
          fix: null,
          confidence: "high",
        });
      } else if (nouveauMod) {
        findings.push({
          severity: "medium",
          title: "NVIDIA GPU is using the open-source nouveau driver",
          detail: "Your NVIDIA card is running on the open nouveau driver. It works for the desktop, but performance and CUDA support are limited — games and GPU compute will underperform.",
          evidence: "hardware: " + (hardware || "nvidia") + "\nmodule: nouveau",
          fix: "Install the proprietary driver from your distro (e.g. `sudo dnf install akmod-nvidia` on Fedora/Bazzite, or the nvidia-driver package on Debian-family).",
          confidence: "high",
        });
      } else {
        findings.push({
          severity: "high",
          title: "NVIDIA GPU detected but no driver is loaded",
          detail: "Your system has an NVIDIA card, but neither the proprietary driver nor nouveau is loaded. Graphics will fall back to slow software rendering.",
          evidence: "hardware: " + (hardware || "nvidia") + "\nloaded modules: " + (loaded || "none"),
          fix: "Install the NVIDIA driver for your distro (e.g. `sudo dnf install akmod-nvidia` on Fedora/Bazzite, or the nvidia-driver package on Debian-family), then reboot.",
          confidence: "high",
        });
      }
    } else if (hasAmd && !amdMod) {
      findings.push({
        severity: "medium",
        title: "AMD GPU detected but the amdgpu driver is not loaded",
        detail: "An AMD card is present but the amdgpu kernel driver is not active. Graphics may be running on a fallback path.",
        evidence: "hardware: " + hardware,
        fix: "Reboot the system; if the problem persists, check your kernel command line for a `nomodeset` option and remove it.",
        confidence: "medium",
      });
    } else if ((hasAmd || hasIntel) && (amdMod || intelMod)) {
      findings.push({
        severity: "info",
        title: "Graphics driver is working",
        detail: `Your ${hasAmd ? "AMD" : "Intel"} GPU is using the standard open-source driver (${amdMod ? "amdgpu" : "i915/xe"}), which is the well-supported default.`,
        evidence: "hardware: " + (hardware || "integrated") + "\nmodule: " + (amdMod ? "amdgpu" : "i915/xe"),
        fix: null,
        confidence: "high",
      });
    }

    // Software rendering is the silent killer: the desktop "works" but is very slow.
    const swRenderer = await detectSoftwareRenderer(ctx);
    if (swRenderer) {
      findings.push({
        severity: "high",
        title: "GPU acceleration is not active (software rendering)",
        detail: "Graphics are being rendered in software (llvmpipe), not by your GPU. Everything visual will feel slow — video playback, scrolling, games. This usually means the GPU driver is missing or misconfigured.",
        evidence: "renderer: " + swRenderer,
        fix: "Install the correct driver for your GPU (see the other GPU findings), then reboot.",
        confidence: "high",
        // The wayland check detects the same root cause; dedupe() keeps this
        // one (gpu is the authoritative check and runs first).
        dedupeKey: "software-rendering",
      });
    }
    return findings;
  },
});
