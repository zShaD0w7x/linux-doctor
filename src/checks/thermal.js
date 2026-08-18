import { lines, num } from "../utils.js";

/**
 * Checks CPU temperatures (via /sys/class/thermal, always available on Linux)
 * and recent thermal-throttling events in the journal. Reads only.
 */
import { defineCheck } from "./define.js";

export const thermal = defineCheck({
  id: "thermal",
  title: "Temperatures and throttling",
  category: "system",
  async run(ctx) {
    const findings = [];
    const t = ctx.thresholds;

    const zones = await ctx.run(
      'for z in /sys/class/thermal/thermal_zone*; do [ -f "$z/type" ] && [ -f "$z/temp" ] && echo "$(cat "$z/type"):$(cat "$z/temp")"; done 2>/dev/null'
    );
    if (!zones.ok || zones.stdout.trim() === "") {
      // No thermal zones (containers, VMs, minimal installs) — say so instead
      // of silently reporting nothing.
      findings.push({
        severity: "info",
        code: "thermal/skipped",
        title: "Temperature check skipped",
        detail: "No CPU thermal zones were found under /sys/class/thermal, so temperatures could not be checked. This is normal in containers and virtual machines.",
        evidence: "no thermal zones",
        fix: null,
        confidence: "high",
      });
    } else {
      // Values are in millidegrees Celsius; take the hottest zone as the
      // headline number (duplicate zones like x86_pkg_temp vs acpitz are
      // harmless — the max is the one that matters).
      let hottest = { type: "", c: 0 };
      for (const l of lines(zones.stdout)) {
        const idx = l.indexOf(":");
        if (idx <= 0) continue;
        const c = num(l.slice(idx + 1)) / 1000;
        if (c > hottest.c) hottest = { type: l.slice(0, idx), c };
      }

      if (hottest.c >= t.tempHotC) {
        findings.push({
          severity: "high",
          code: "thermal/hot",
          title: "CPU is running very hot",
          detail: `The hottest thermal zone (${hottest.type}) is at ${hottest.c.toFixed(0)}°C. Prolonged operation above 95°C risks throttling and long-term damage.`,
          evidence: `${hottest.type}: ${hottest.c.toFixed(0)}°C`,
          fix: "Clean dust from the cooling fans, check the thermal paste, and make sure the laptop's cooling profile allows the fans to spin up.",
          confidence: "medium",
        });
      } else if (hottest.c >= t.tempWarnC) {
        findings.push({
          severity: "medium",
          code: "thermal/warm",
          title: "CPU is running hot",
          detail: `The hottest thermal zone (${hottest.type}) is at ${hottest.c.toFixed(0)}°C. This is warm enough to trigger throttling under sustained load.`,
          evidence: `${hottest.type}: ${hottest.c.toFixed(0)}°C`,
          fix: "Check for dust in the fans, and consider a more aggressive cooling profile for the laptop.",
          confidence: "medium",
        });
      } else {
        findings.push({
          severity: "info",
          code: "thermal/ok",
          title: "Temperatures look fine",
          detail: `The hottest thermal zone (${hottest.type}) is at ${hottest.c.toFixed(0)}°C, which is well within normal range.`,
          evidence: `${hottest.type}: ${hottest.c.toFixed(0)}°C`,
          fix: null,
          confidence: "high",
        });
      }
    }

    // journalctl -g prints "-- Boot ... --" separators and "-- No entries --"
    // even when nothing matches, so strip them or we'd report false positives.
    // The pattern must be narrow: "throttl" alone also matches app-level
    // messages like "setStartupThrottle" (Roblox, Chromium, ...) that have
    // nothing to do with CPU heat. The real kernel messages always contain
    // "clock throttl" (e.g. "cpu clock throttled") and come from the kernel.
    // Filter in JS too, so even a journalctl version with a loose -g match
    // can never surface an app message as CPU throttling.
    const throttle = await ctx.run('journalctl -g "clock throttl" --since "-24 hours" --no-pager -o short 2>/dev/null | grep -v "^-- " | tail -3');
    const throttleLines = throttle.ok
      ? lines(throttle.stdout).filter((l) => /kernel:.*clock throttl/i.test(l))
      : [];
    if (throttleLines.length > 0) {
      findings.push({
        severity: "medium",
        code: "thermal/throttle",
        title: "CPU throttling events in the log",
        detail: "The kernel reported thermal throttling in the last 24 hours, meaning the CPU had to slow down to cool off. This can cause stutter and slow builds.",
        evidence: throttleLines.slice(0, 2).join("\n"),
        fix: "Address cooling (dust, fans, thermal paste) — throttling under load is a cooling problem, not a software problem.",
        confidence: "medium",
      });
    }

    return findings;
  },
});
