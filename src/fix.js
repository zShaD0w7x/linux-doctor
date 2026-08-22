/**
 * Safe-fix catalog: maps stable finding codes to concrete, whitelisted shell
 * commands. This is the ONLY place commands come from — a finding's free-text
 * `fix` field is never executed. Every entry is a pure function of the finding
 * (plus the system context), so the same run always produces the same plan and
 * a malformed finding can at worst yield zero commands.
 *
 * Tiers:
 *   "apply"  — the command changes system state, but is scoped, standard and
 *              easily reversible (restart one unit, vacuum the journal). Only
 *              ever run with an explicit second opt-in (`--fix --yes`).
 *   "manual" — printed for the user to run themselves (reboot, firmware
 *              update, anything that can cut a remote session or needs a
 *              decision). Never executed by linux-doctor.
 *
 * Parameters (unit names) are parsed from the finding's own evidence/detail
 * text, validated against strict patterns, and shell-quoted with shq() before
 * being interpolated.
 */
import { shq } from "./utils.js";

/** A systemd unit name: letters/digits/@ . _ - then .service/.timer/.socket. */
const UNIT_RE = /^[A-Za-z0-9_.@\\-]+\.(service|timer|socket|target)$/;

/** Extract backticked or bare unit names from free text. */
function unitNames(text, exts = ["service", "timer", "socket", "target"]) {
  const out = [];
  const seen = new Set();
  const re = /[A-Za-z0-9_.@\\-]+\.(?:service|timer|socket|target)/g;
  for (const raw of String(text || "").match(re) || []) {
    if (!UNIT_RE.test(raw)) continue;
    const ext = raw.split(".").pop();
    if (!exts.includes(ext)) continue;
    // Template units ("app-picom@autostart.service") are per-instance; keep
    // them whole — resetting/restarting the exact instance is what's wanted.
    if (!seen.has(raw)) {
      seen.add(raw);
      out.push(raw);
    }
  }
  return out;
}

/** Is this unit a --user unit? The services check tags scope in its evidence. */
function isUserUnit(finding, unit) {
  return new RegExp(`${unit.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s+user`).test(String(finding.evidence || ""));
}

const CATALOG = {
  /**
   * Failed units: clearing failed state is harmless (it only resets the
   * status, it does not stop or start anything), so reset-failed is "apply";
   * restarting the unit changes state, so restart stays in the plan as a
   * follow-up command the user sees before confirming with --yes.
   */
  "services/failed": (f) => {
    const cmds = [];
    for (const u of unitNames(`${f.detail}\n${f.evidence}`, ["service"])) {
      const scope = isUserUnit(f, u) ? "--user" : "--system";
      if (scope === "--system") {
        // System-level restart needs sudo — offer reset-failed without sudo,
        // leave the sudo restart visible in the plan (still tier "apply").
        cmds.push({ cmd: `sudo systemctl reset-failed ${shq(u)}`, tier: "apply" });
      } else {
        cmds.push({ cmd: `systemctl --user reset-failed ${shq(u)}`, tier: "apply" });
        cmds.push({ cmd: `systemctl --user restart ${shq(u)}`, tier: "apply" });
      }
    }
    return cmds;
  },

  /** Enabled-but-never-run timers: starting the timer re-arms it. */
  "timers/broken": (f) =>
    unitNames(`${f.detail}\n${f.evidence}`, ["timer"]).map((t) => ({
      cmd: `sudo systemctl start ${shq(t)}`,
      tier: "apply",
    })),

  /**
   * Pending updates. Command follows the detected package family — on
   * image-based systems the transactional updater is used instead.
   */
  "updates/pending": (_f, { family, imageBased } = {}) => {
    if (imageBased) return [{ cmd: "rpm-ostree upgrade", tier: "apply" }];
    switch (family) {
      case "rhel": return [{ cmd: "sudo dnf upgrade", tier: "apply" }];
      case "debian": return [{ cmd: "sudo apt update && sudo apt upgrade", tier: "apply" }];
      case "arch": return [{ cmd: "sudo pacman -Syu", tier: "apply" }];
      case "suse": return [{ cmd: "sudo zypper dup", tier: "apply" }];
      default: return []; // unknown family → nothing is better than a guess
    }
  },

  "flatpak/pending": () => [{ cmd: "flatpak update", tier: "apply" }],
  "snap/pending": () => [{ cmd: "sudo snap refresh", tier: "apply" }],

  /** fstrim disabled: re-enable the shipped weekly timer. */
  "fstrim/disabled": () => [{ cmd: "sudo systemctl enable --now fstrim.timer", tier: "apply" }],

  /** Oversized journal: cap it at 200M (old entries are dropped, config intact). */
  "journald/large": () => [{ cmd: "sudo journalctl --vacuum-size=200M", tier: "apply" }],

  /** A pending reboot is the user's call — never schedule one from a tool. */
  "reboot/required": () => [{ cmd: "systemctl reboot", tier: "manual" }],
};

/**
 * Build the fix plan for the current findings. Returns one entry per finding
 * that has at least one catalogued command, preserving report order.
 */
export function planFixes(findings, { system } = {}) {
  const ctx = {
    family: system?.family ?? null,
    imageBased: !!system?.imageBased,
  };
  const plan = [];
  for (const f of findings) {
    const build = CATALOG[f.code];
    if (!build) continue;
    let commands = [];
    try {
      commands = build(f, ctx) || [];
    } catch {
      commands = []; // a parsing surprise must never break the plan
    }
    commands = commands.filter((c) => c && typeof c.cmd === "string" && (c.tier === "apply" || c.tier === "manual"));
    if (commands.length > 0) plan.push({ code: f.code, title: f.title, severity: f.severity, id: f.id, commands });
  }
  return plan;
}

/** Human-readable plan for --fix (dry-run) and the interactive fix view. */
export function formatPlan(plan, { dryRun = true } = {}) {
  const out = [];
  out.push(dryRun ? "# linux-doctor --fix (dry run — nothing was executed)" : "# linux-doctor --fix");
  out.push("# Commands come only from the built-in safe-fix catalog for these findings.");
  out.push("");
  let n = 0;
  for (const entry of plan) {
    for (const c of entry.commands) {
      n += 1;
      const tag = c.tier === "manual" ? "[manual]" : "[apply]";
      out.push(`${n}. ${tag} (${entry.code}) ${c.cmd}`);
    }
  }
  if (n === 0) {
    out.push("No safe fixes available for the findings on this system.");
    out.push("(Everything else already prints a copy-paste suggestion in the report.)");
  } else if (dryRun) {
    out.push("");
    out.push("This was a dry run. Review the list above, then run `linux-doctor --fix --yes` to execute the [apply] commands ([manual] ones are never executed).");
  }
  return out.join("\n");
}
