/**
 * The check registry — the single place a check is registered. Order matters:
 * it is the --list order, and dedupe ties keep the first finding (the
 * specialized check is listed before the aggregator one). Categories are
 * grouped contiguously so --list reads naturally.
 */
import { memory } from "./memory.js";
import { load } from "./load.js";
import { disk } from "./disk.js";
import { processes } from "./processes.js";
import { thermal } from "./thermal.js";
import { journald } from "./journald.js";
import { services } from "./services.js";
import { timers } from "./timers.js";
import { journal } from "./journal.js";
import { suspend } from "./suspend.js";
import { security } from "./security.js";
import { secureboot } from "./secureboot.js";
import { luks } from "./luks.js";
import { network } from "./network.js";
import { ntp } from "./ntp.js";
import { updates } from "./updates.js";
import { firmware } from "./firmware.js";
import { flatpak } from "./flatpak.js";
import { reboot } from "./reboot.js";
import { battery } from "./battery.js";
import { gpu } from "./gpu.js";
import { bluetooth } from "./bluetooth.js";
import { wayland } from "./wayland.js";
import { smart } from "./smart.js";
import { hardware } from "./hardware.js";
import { backup } from "./backup.js";

export const checks = [
  // system
  memory, load, disk, processes, thermal, journald,
  // software
  services, timers, journal, suspend,
  // security
  security, secureboot, luks,
  // network
  network, ntp,
  // updates
  updates, firmware, flatpak, reboot,
  // hardware
  battery, gpu, bluetooth, wayland, smart, hardware,
  // data
  backup,
];

export const byId = new Map(checks.map((c) => [c.id, c]));
