/**
 * First-run wizard: `linux-doctor --init`.
 *
 * A guided setup for people who just installed the tool: it summarizes the
 * environment (machine profile, systemd, node), then offers the three setup
 * steps that turn a one-off run into set-and-forget monitoring — a starter
 * config, the daily systemd timer, and a desktop-notification test. Every
 * mutating step asks first and defaults to yes; answering "n" just skips it.
 *
 * Without a TTY there is nothing to ask, so it prints the same steps as
 * copy-paste commands instead (like --interactive falling back to the
 * printed report). All side effects are injectable so tests never touch a
 * real session, config, or notification daemon.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { configFile } from "./config.js";
import { systemdPresent, timerStatus, installTimer } from "./units.js";
import { canNotify, sendNotification } from "./notify.js";
import { detectProfile } from "./profile.js";
import { starterConfig } from "./cli.js";

async function defaultAsk(question) {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => rl.question(question, resolve));
  } finally {
    rl.close();
  }
}

/** [Y/n] prompt — empty answer takes the default (yes unless told otherwise). */
async function confirm(ask, question, defYes = true) {
  const hint = defYes ? "[Y/n]" : "[y/N]";
  const ans = String(await ask(`${question} ${hint} `)).trim().toLowerCase();
  if (ans === "") return defYes;
  return ans === "y" || ans === "yes";
}

function writeStarterConfig() {
  const file = configFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, starterConfig(), "utf8");
  return file;
}

export async function runWizard({
  ask = defaultAsk,
  print = console.log, // eslint-disable-line no-console
  isTTY = !!(process.stdin.isTTY && process.stdout.isTTY),
  systemd = systemdPresent(),
  timer = timerStatus(),
  profileKind = null, // detected live when null
  configExists = existsSync(configFile()),
  doWriteConfig = writeStarterConfig,
  doInstallTimer = () => installTimer(),
  notifyCapable = canNotify(),
  doNotifyTest = () => sendNotification({ title: "Linux Doctor: notifications work", body: "You will only hear from scheduled checks when something new breaks." }),
} = {}) {
  if (!isTTY) {
    print("Linux Doctor setup (non-interactive — run each step yourself):");
    print("  1. linux-doctor --init-config   # starter config with tunable thresholds");
    print("  2. linux-doctor --install-timer # daily checks, notify only on new findings (needs systemd)");
    print("  3. linux-doctor                 # first health report");
    return 0;
  }

  const kind = profileKind ?? (await detectProfile()).kind;
  print(`Detected: ${kind} · systemd ${systemd ? "present" : "absent"} · node ${process.version}`);

  if (!configExists) {
    if (await confirm(ask, "Write a starter config file?")) {
      try {
        print(`Config written to ${doWriteConfig()}`);
      } catch (err) {
        print(`Could not write config: ${err?.message || err}`);
      }
    }
  } else {
    print("Config file already exists — leaving it alone.");
  }

  if (!systemd) {
    print("No systemd here — skipping the timer. For scheduled checks, add a cron line instead (see docs/cli.md).");
  } else if (timer.installed && timer.active) {
    print("Daily timer is already installed and active — nothing to do.");
  } else {
    if (timer.installed) print("Timer units exist but the timer isn't active — re-running the installer fixes that.");
    if (await confirm(ask, "Install the daily timer (after boot + daily, notifies only on new findings)?")) {
      const res = doInstallTimer();
      print(res.ok ? res.message : `Could not install timer: ${res.error}`);
    }
  }

  if (notifyCapable) {
    if (await confirm(ask, "Send a test desktop notification?")) {
      print(doNotifyTest() ? "Test notification sent — look for the bubble." : "Notification daemon did not accept it (missing notify-send or no session).");
    }
  } else {
    print("No graphical session detected — skipping the notification test.");
  }

  print("Done. Run `linux-doctor` for a report, `linux-doctor --web` for the dashboard.");
  return 0;
}
