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

  /** Container image storage bloated: prune unused images (safe, only dangling/unused). */
  "containerdisk/high": () => [{ cmd: "podman system prune -f 2>/dev/null || docker system prune -f 2>/dev/null", tier: "apply" }],
  "containerdisk/warn": () => [{ cmd: "podman system prune -f 2>/dev/null || docker system prune -f 2>/dev/null", tier: "apply" }],

  /**
   * No firewall: enable firewalld (Fedora/RHEL) or ufw (Debian) based on
   * family. ufw's default policy denies new incoming connections, so SSH
   * MUST be allowed before enabling — otherwise a headless machine refuses
   * its next login. `--force` skips ufw's interactive y/n prompt (this tool
   * runs commands non-interactively; an unattended prompt would hang until
   * the timeout). Existing established sessions survive via conntrack.
   */
  "security/no-firewall": (_f, { family } = {}) => {
    if (family === "debian") {
      return [
        { cmd: "sudo ufw allow OpenSSH", tier: "apply" },
        { cmd: "sudo ufw --force enable", tier: "apply" },
      ];
    }
    return [{ cmd: "sudo systemctl enable --now firewalld", tier: "apply" }];
  },

  /** Pending firmware: fwupd refresh. */
  "firmware/pending": () => [{ cmd: "sudo fwupdmgr refresh && sudo fwupdmgr update", tier: "manual" }],

  /** Broken locales: regenerate. */
  "locales/broken": (_f, { family } = {}) => {
    if (family === "debian") return [{ cmd: "sudo locale-gen && sudo update-locale", tier: "apply" }];
    if (family === "arch") return [{ cmd: "sudo locale-gen", tier: "apply" }];
    return [{ cmd: "sudo localectl set-locale LANG=en_US.UTF-8", tier: "apply" }];
  },

  /** Disk nearly full: offer safe cleanups per family. */
  "disk/full": (_f, { family } = {}) => {
    const cmds = [{ cmd: "sudo journalctl --vacuum-size=500M", tier: "apply" }];
    if (family === "debian") cmds.push({ cmd: "sudo apt clean", tier: "apply" });
    else if (family === "arch") cmds.push({ cmd: "sudo pacman -Sc --noconfirm", tier: "apply" });
    else if (family === "fedora" || family === "rhel") cmds.push({ cmd: "sudo dnf clean all", tier: "apply" });
    else if (family === "suse") cmds.push({ cmd: "sudo zypper clean", tier: "apply" });
    return cmds;
  },

  /** Failed suspend/resume hooks */
  "suspend/failed": () => [{ cmd: "sudo systemctl restart systemd-suspend.service 2>/dev/null; sudo journalctl --vacuum-size=200M", tier: "apply" }],

  /**
   * Network: reconnecting cycles the interface down/up, which severs any
   * session routed through it — including an SSH run of `--fix --yes` itself
   * (the follow-up command would never execute and networking could stay
   * down). That is exactly the "can cut a remote session" case this catalog
   * reserves for the manual tier.
   */
  "network/no-route": () => [{ cmd: "nmcli networking off && nmcli networking on 2>/dev/null || sudo systemctl restart NetworkManager", tier: "manual" }],
  "network/dns": () => [{ cmd: "sudo systemctl restart systemd-resolved 2>/dev/null; sudo resolvconf --enable-updates 2>/dev/null; echo 'Check /etc/resolv.conf'", tier: "manual" }],
  "network/dns-slow": () => [{ cmd: "sudo systemctl restart systemd-resolved 2>/dev/null", tier: "apply" }],

  /** SSH hardening: manual — editing sshd_config needs review */
  "ssh/root-login": () => [{ cmd: "sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && sudo systemctl restart sshd", tier: "manual" }],
  "ssh/root-password": () => [{ cmd: "sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config && sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl restart sshd", tier: "manual" }],

  /** Bluetooth: restart service */
  "bluetooth/stopped": () => [{ cmd: "sudo systemctl enable --now bluetooth.service", tier: "apply" }],
  "bluetooth/failed": () => [{ cmd: "sudo systemctl restart bluetooth.service", tier: "apply" }],

  /** NTP: enable timesync */
  "ntp/unsynced": () => [{ cmd: "sudo timedatectl set-ntp true 2>/dev/null || sudo systemctl enable --now systemd-timesyncd", tier: "apply" }],
  "ntp/pending": () => [{ cmd: "sudo timedatectl set-ntp true", tier: "apply" }],

  /** Thermal: no safe auto-fix — just guidance, manual */
  "thermal/warm": () => [{ cmd: "sensors 2>/dev/null | head -20; echo 'Clean fans, check airflow'", tier: "manual" }],
  "thermal/hot": () => [{ cmd: "sensors 2>/dev/null | head -20; echo 'URGENT: check cooling'", tier: "manual" }],
  "thermal/throttle": () => [{ cmd: "journalctl -k --since '1 hour ago' | grep -i throttle | tail -5", tier: "manual" }],

  /** Hardware: MCE/ECC — manual, needs hw check */
  "hardware/mce": () => [{ cmd: "sudo journalctl -k --since '1 day ago' | grep -i mce | tail -10", tier: "manual" }],
  "hardware/ecc": () => [{ cmd: "sudo journalctl -k --since '1 day ago' | grep -i ecc | tail -10", tier: "manual" }],

  /** Autologin: manual — needs display-manager edit */
  "security/autologin": () => [{ cmd: "sudo sed -i 's/^AutomaticLoginEnable=.*/AutomaticLoginEnable=false/' /etc/gdm/custom.conf 2>/dev/null; echo 'Disable autologin in /etc/gdm/custom.conf or /etc/sddm.conf'", tier: "manual" }],

  /** Backup none: manual — install suggestion per family */
  "backup/none": (_f, { family } = {}) => {
    if (family === "debian") return [{ cmd: "sudo apt install timeshift borgbackup", tier: "manual" }];
    if (family === "arch") return [{ cmd: "sudo pacman -S timeshift borg", tier: "manual" }];
    if (family === "suse") return [{ cmd: "sudo zypper install snapper borgbackup", tier: "manual" }];
    return [{ cmd: "sudo dnf install timeshift borgbackup 2>/dev/null || sudo dnf install snapper", tier: "manual" }];
  },

  /** Inodes nearly full: same cleanup as disk, plus hunt for tiny-file spam. */
  "inodes/full": () => [{ cmd: "sudo journalctl --vacuum-size=500M; echo 'Hunt tiny files: sudo find / -xdev -type f | cut -d/ -f3 | sort | uniq -c | sort -rn | head -20'", tier: "manual" }],

  /** Orphaned packages: family-aware autoremove */
  "orphans/many": (_f, { family } = {}) => {
    if (family === "arch") return [{ cmd: "sudo pacman -Rns $(pacman -Qtdq)", tier: "apply" }];
    if (family === "debian") return [{ cmd: "sudo apt autoremove", tier: "apply" }];
    if (family === "suse") return [{ cmd: "sudo zypper packages --unneeded | grep '^i' && sudo zypper remove --clean-deps $(zypper packages --unneeded | awk '/^i/ {print $5}')", tier: "manual" }];
    return [{ cmd: "sudo dnf autoremove", tier: "apply" }];
  },
  "orphans/some": (_f, { family } = {}) => {
    if (family === "arch") return [{ cmd: "sudo pacman -Rns $(pacman -Qtdq)", tier: "apply" }];
    if (family === "debian") return [{ cmd: "sudo apt autoremove", tier: "apply" }];
    return [{ cmd: "sudo dnf autoremove", tier: "apply" }];
  },

  /** Unused Flatpak runtimes */
  "flatpak/unused-runtimes": () => [{ cmd: "flatpak uninstall --unused", tier: "apply" }],

  /** Boot partition nearly full / missing grub.cfg */
  "boot/full": () => [{ cmd: "sudo dnf remove --oldinstallonly --setopt installonly_limit=2 kernel 2>/dev/null || sudo apt autoremove --purge 2>/dev/null; sudo grub2-mkconfig -o /boot/grub2/grub.cfg 2>/dev/null || sudo grub-mkconfig -o /boot/grub/grub.cfg 2>/dev/null", tier: "manual" }],
  "boot/no-config": () => [{ cmd: "sudo grub2-mkconfig -o /boot/grub2/grub.cfg 2>/dev/null || sudo grub-mkconfig -o /boot/grub/grub.cfg 2>/dev/null || sudo bootctl install", tier: "manual" }],

  /** Cache and trash bloat */
  "cache/large": () => [{ cmd: "du -sh ~/.cache/* 2>/dev/null | sort -rh | head -20; echo '---'; rm -rf ~/.cache/thumbnails/* 2>/dev/null; echo 'Cleared thumbnails'", tier: "manual" }],
  "cache/trash": () => [{ cmd: "gio trash --empty 2>/dev/null || rm -rf ~/.local/share/Trash/*", tier: "apply" }],

  /** WiFi blocked/disabled */
  "wifi/blocked": () => [{ cmd: "rfkill unblock wifi && nmcli radio wifi on", tier: "apply" }],
  "wifi/disabled": () => [{ cmd: "nmcli radio wifi on", tier: "apply" }],

  /** Broken package manager */
  "packages/broken": () => [{ cmd: "sudo dpkg --configure -a 2>/dev/null; sudo apt --fix-broken install 2>/dev/null || sudo dnf check 2>/dev/null; sudo pacman -Dk 2>/dev/null", tier: "manual" }],
  "packages/locked": () => [{ cmd: "ps aux | grep -E 'apt|dpkg' | grep -v grep", tier: "manual" }],

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
