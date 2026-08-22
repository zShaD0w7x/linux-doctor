/**
 * Native desktop notifications via notify-send (freedesktop.org). Used by the
 * CLI run and the --daemon agent when new problems appear, so the user learns
 * about degradation without opening a terminal. Best effort, always silent:
 * a missing notify-send or no graphical session is simply "no notification".
 */
import { exec } from "node:child_process";
import { shq } from "./utils.js";

/** A graphical session is the only place a notification can appear. */
export function canNotify(env = process.env) {
  return !!(env.WAYLAND_DISPLAY || env.DISPLAY || env.XDG_CURRENT_DESKTOP);
}

/**
 * Send one desktop notification. Never throws, never logs — fire and forget.
 * Body text is shell-quoted; title/body are truncated to keep the bubble sane.
 */
export function sendNotification({ title, body = "" } = {}) {
  if (!canNotify()) return false;
  const clip = (s, n) => String(s ?? "").slice(0, n);
  try {
    exec(`notify-send ${shq(clip(title, 80))} ${shq(clip(body, 200))} >/dev/null 2>&1 &`, () => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether this report deserves a notification: something NEW appeared at
 * medium/high severity (a degraded machine), not just the same old findings.
 * Pure — exported for tests. `diff` is diffSinceLast() output.
 */
export function shouldNotify({ counts = {}, diff } = {}) {
  const added = diff?.added || [];
  return added.some((f) => f.severity === "high" || f.severity === "medium");
}

/** Build the notification text from a finished report. */
export function notificationFor(report) {
  const high = report.counts?.high ?? 0;
  const med = report.counts?.medium ?? 0;
  const scoreTxt = typeof report.score === "number" ? ` · health ${report.score}/100` : "";
  return {
    title: high > 0 ? "Linux Doctor: urgent issue found" : "Linux Doctor: new issues found",
    body: `${high} high · ${med} medium · ${report.newCount} new since last run${scoreTxt} — run linux-doctor for details`,
  };
}
