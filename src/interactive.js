/**
 * Interactive mode (`--interactive`): a zero-dependency terminal UI over the
 * finished report. Arrow keys pick a finding, Enter opens the details, c
 * copies the suggested fix to the clipboard, f shows the safe-fix commands
 * (from src/fix.js) when the finding has any, q quits. Nothing is ever
 * executed from here — "apply" still means copying a command or re-running
 * with --fix --yes.
 *
 * Requires a TTY on stdin; callers fall back to the printed report otherwise.
 */
import readline from "node:readline";
import { exec } from "node:child_process";
import { shq } from "./utils.js";

const A = {
  bold: "\x1b[1m", dim: "\x1b[2m", reset: "\x1b[0m",
  red: "\x1b[31m", yellow: "\x1b[33m", blue: "\x1b[34m", cyan: "\x1b[36m", green: "\x1b[32m",
};
const SEV_COLOR = { high: A.red, medium: A.yellow, info: A.blue };
const SEV_ICON = { high: "🔴", medium: "🟡", info: "🔵" };

const CLEAR = "\x1b[2J\x1b[H";
const SHOW_CURSOR = "\x1b[?25h";

/** Order findings the way the report does: high → medium → info. */
const SEV_RANK = { high: 0, medium: 1, info: 2 };
function sorted(findings) {
  return [...findings].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
}

/** First command of the safe-fix plan for this finding's code, if any. */
export function fixCommandFor(plan, code) {
  const entry = (plan || []).find((p) => p.code === code && p.commands.some((c) => c.tier === "apply"));
  return entry ? entry.commands.find((c) => c.tier === "apply").cmd : null;
}

/**
 * Clipboard without dependencies: wl-copy (Wayland), xclip (X11), pbcopy
 * (macOS). When none exists, emit an OSC 52 escape — many terminals
 * (kitty, alacritty, foot, tmux) handle it natively.
 */
export function copyToClipboard(text, cb = () => {}) {
  const payload = shq(text);
  const tried = [];
  const attempt = (i) => {
    const candidates = [
      ["wl-copy", `printf %s ${payload} | wl-copy`],
      ["xclip", `printf %s ${payload} | xclip -selection clipboard`],
      ["pbcopy", `printf %s ${payload} | pbcopy`],
    ];
    if (i >= candidates.length) {
      try {
        const b64 = Buffer.from(text, "utf8").toString("base64");
        process.stdout.write(`\x1b]52;c;${b64}\x07`);
        cb("copied (OSC52)");
      } catch {
        cb("failed");
      }
      return;
    }
    const [name, cmd] = candidates[i];
    exec(`command -v ${name} >/dev/null 2>&1 && { ${cmd}; }`, (err) => {
      if (!err) cb(`copied (${name})`);
      else attempt(i + 1);
    });
  };
  attempt(0);
}

/** Render one list frame. */
function renderList(items, sel, subtitle = "") {
  const out = [CLEAR, `${A.bold}🩺 Linux Doctor${A.reset} — ${items.length} finding(s). ${A.dim}${subtitle}${A.reset}`, ""];
  items.forEach((f, i) => {
    const cur = i === sel;
    const color = SEV_COLOR[f.severity] || "";
    const marker = cur ? `${A.cyan}❯${A.reset} ` : "  ";
    const badge = f.isNew ? `${A.cyan}${A.bold} NEW${A.reset}` : "";
    out.push(`${marker}${color}${String(i + 1).padStart(2)}. ${SEV_ICON[f.severity] || "·"} ${f.title}${A.reset}${badge}`);
  });
  out.push("", `${A.dim}↑/↓ or j/k select · Enter details · q quit${A.reset}`);
  return out.join("\n");
}

/** Render one detail frame. */
function renderDetail(f, fixCmd) {
  const color = SEV_COLOR[f.severity] || "";
  const out = [CLEAR, `${color}${A.bold}${f.title}${A.reset}`];
  out.push(`${A.dim}${f.severity}${f.code ? ` · ${f.code}` : ""}${A.reset}`, "");
  if (f.detail) out.push(f.detail, "");
  if (f.evidence) {
    out.push(`${A.dim}Evidence:${A.reset}`);
    for (const line of String(f.evidence).split("\n").slice(0, 10)) out.push(`  ${line}`);
    out.push("");
  }
  if (f.fix) out.push(`${A.dim}How to fix:${A.reset}`, `  ${f.fix}`, "");
  if (fixCmd) out.push(`${A.green}Safe fix available:${A.reset} ${A.bold}${fixCmd}${A.reset}`, "");
  out.push(`${A.dim}[c] copy fix text${fixCmd ? " · [f] copy safe-fix command" : ""} · Esc/b back · q quit${A.reset}`);
  return out.join("\n");
}

/**
 * Run the picker over `findings`. Resolves with "quit" when the user leaves
 * (or Ctrl+C) — the caller decides the exit code afterwards. Rejects only if
 * raw mode is unavailable (no TTY).
 */
export function runInteractive(findings, { plan = [] } = {}) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
      reject(new Error("interactive mode needs a terminal (TTY) on stdin"));
      return;
    }
    const items = sorted(findings);
    if (items.length === 0) {
      console.log(CLEAR + "✅ Nothing to review — no findings.");
      resolve("done");
      return;
    }
    let sel = 0;
    let view = "list"; // "list" | "detail"
    let dirty = true;

    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write("\x1b[?25l"); // hide cursor while drawing

    const cleanup = (result) => {
      process.stdin.removeListener("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
      resolve(result);
    };
    const onKey = (ch, key) => {
      const name = key?.name ?? String(ch ?? "");
      if (key?.ctrl && name === "c") {
        cleanup("quit");
        return;
      }
      if (view === "list") {
        if (name === "down" || ch === "j") sel = Math.min(items.length - 1, sel + 1);
        else if (name === "up" || ch === "k") sel = Math.max(0, sel - 1);
        else if (name === "return" || ch === "o" || name === "space") view = "detail";
        else if (ch === "q") {
          cleanup("quit");
          return;
        } else dirty = false;
      } else {
        if (name === "escape" || ch === "b" || name === "left") view = "list";
        else if (ch === "c") {
          const f = items[sel];
          copyToClipboard(f.fix || f.detail || f.title, (how) => {
            process.stdout.write(`\r\x1b[K${A.dim}clipboard: ${how}${A.reset}`);
            dirty = true; // redraw over the status line next keypress
          });
          dirty = false;
        } else if (ch === "f") {
          const cmd = fixCommandFor(plan, items[sel].code);
          if (cmd) {
            copyToClipboard(cmd, (how) => {
              process.stdout.write(`\r\x1b[K${A.dim}safe-fix copied (${how}) — run it yourself, or --fix --yes${A.reset}`);
              dirty = true;
            });
          }
          dirty = false;
        } else if (ch === "q") {
          cleanup("quit");
          return;
        } else dirty = false;
      }
      if (dirty) {
        dirty = false;
        process.stdout.write(view === "list" ? renderList(items, sel) : renderDetail(items[sel], fixCommandFor(plan, items[sel].code)));
      }
    };
    process.stdin.on("keypress", onKey);
    process.stdout.write(renderList(items, sel));
  });
}
