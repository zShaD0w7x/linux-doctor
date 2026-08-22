import { lines, shq } from "../utils.js";
import { detectSoftwareRenderer } from "./shared.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Checks the graphical session: what type it is (Wayland vs X11), whether the
 * Wayland compositor is actually running, and whether the session is stuck on
 * software rendering (the classic Wayland pain point). All reads only.
 */

export const wayland = defineCheck({
  id: "wayland",
  title: "Wayland / display session",
  category: "hardware",
  appliesTo: ["desktop", "laptop"],
  async run(ctx) {
    const findings = [];

    const sid = await ctx.run(
      'loginctl list-sessions --no-legend 2>/dev/null | awk \'$2=="seat0"{print $1}\' | head -1'
    );
    if (sid.missing) {
      findings.push(finding({
        severity: "info",
        code: "wayland/loginctl-missing",
        title: "Session type could not be determined",
        detail: "`loginctl` is not available on this system, so the display session could not be inspected.",
        evidence: "loginctl: missing",
        fix: null,
        confidence: "medium",
      }));
      return findings;
    }

    const sessionId = sid.stdout.trim();
    if (sessionId === "") {
      findings.push(finding({
        severity: "info",
        code: "wayland/no-session",
        title: "No graphical session detected",
        detail: "No graphical login session was found on the primary seat. This is normal on servers and headless machines.",
        evidence: "no seat0 session",
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    const show = await ctx.run(`loginctl show-session ${shq(sessionId)} -p Type -p Desktop 2>/dev/null`);
    const info = {};
    for (const l of lines(show.stdout)) {
      const idx = l.indexOf("=");
      if (idx > 0) info[l.slice(0, idx)] = l.slice(idx + 1);
    }
    const type = (info.Type || "").toLowerCase();
    const desktop = info.Desktop || "";

    if (type === "x11") {
      findings.push(finding({
        severity: "info",
        code: "wayland/x11",
        title: "Running an X11 session",
        detail: `The current session uses X11 (${desktop || "unknown desktop"}). X11 is mature and stable; most modern desktops also offer a Wayland session that you can try from the login screen.`,
        evidence: `session type: x11${desktop ? " · desktop: " + desktop : ""}`,
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    if (type !== "wayland") {
      findings.push(finding({
        severity: "info",
        code: "wayland/not-graphical",
        title: "No graphical session detected",
        detail: `The active session is not graphical (type: ${info.Type || "unknown"}). This is normal on servers and headless machines.`,
        evidence: `session type: ${info.Type || "unknown"}`,
        fix: null,
        confidence: "high",
      }));
      return findings;
    }

    // Wayland session: the compositor must actually be running. The [x]
    // character classes keep the pattern from matching this very command.
    const comp = await ctx.run(
      "pgrep -a -f 'kwin_[w]ayland|gnome-[s]hell|[s]way|[h]yprland|[r]iver|[w]ayfire|[l]abwc|[n]iri|cosmic-[c]omp|[m]utter|[w]eston|[c]age' 2>/dev/null | head -1"
    );
    const compName = comp.ok && comp.stdout.trim() ? comp.stdout.trim().split(/\s+/).slice(1).join(" ") : "";

    if (compName) {
      findings.push(finding({
        severity: "info",
        code: "wayland/healthy",
        title: "Wayland session looks healthy",
        detail: `The session is running Wayland (${desktop || "unknown desktop"}) and the compositor (${compName}) is up.`,
        evidence: `session type: wayland · desktop: ${desktop || "unknown"}\ncompositor: ${compName}`,
        fix: null,
        confidence: "high",
      }));
    } else {
      findings.push(finding({
        severity: "medium",
        code: "wayland/no-compositor",
        title: "Wayland session is active, but no compositor process was found",
        detail: `The session is Wayland (${desktop || "unknown desktop"}), but none of the common compositors (GNOME Shell, KWin, Sway, Hyprland, …) is running. The session may be stuck or the compositor may have crashed.`,
        evidence: "session type: wayland\ncompositor: none found",
        fix: "Try logging out and back in from the login screen. If it keeps happening, check the session logs with `journalctl -b -p err`.",
        confidence: "medium",
      }));
    }

    const swRenderer = await detectSoftwareRenderer(ctx);
    if (swRenderer) {
      findings.push(finding({
        severity: "medium",
        code: "wayland/software-rendering",
        title: "Wayland is falling back to software rendering",
        detail: `Graphics are being rendered in software (${swRenderer}), so the compositor has no GPU acceleration. The desktop will feel slow — window animations, video, and scrolling all suffer.`,
        evidence: "renderer: " + swRenderer,
        fix: "Install the correct GPU driver for your hardware (see the GPU check), then reboot into the Wayland session again.",
        confidence: "high",
        // The gpu check detects the same root cause; dedupe() keeps the gpu
        // finding (it is more actionable and runs first).
        dedupeKey: "software-rendering",
      }));
    }

    return findings;
  },
});
