// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The safe-fix catalog is per-family. This is the matrix that says what each
 * family may be told to run — and, just as important, where the catalog must
 * stay silent.
 *
 * It exists because the catalog used to fall through to a default branch for
 * every family it did not know, which is how openSUSE was told to run
 * `dnf autoremove`, Alpine `systemctl enable firewalld`, and Void
 * `localectl set-locale`. Those commands do not exist there. A fix that cannot
 * be run is worse than no fix: it is a wrong instruction with the tool's
 * authority behind it.
 *
 * Sources for every command in the matrix are in
 * internal/research-distro-commands.md and
 * internal/research-firewall-trim-locales-flatpak.md (primary distro docs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { planFixes } from "../src/fix.js";

const finding = (code) => ({ id: 1, code, severity: "medium", title: "t", detail: null, evidence: "" });

/** All commands the catalog would emit for a code on a system, joined. */
function cmds(code, system) {
  const plan = planFixes([finding(code)], { system });
  return plan.flatMap((p) => p.commands.map((c) => c.cmd));
}
const emit = (code, system) => cmds(code, system).join(" ; ");

const SYS = {
  debian: { family: "debian", id: "ubuntu", hasSystemd: true },
  fedora: { family: "fedora", id: "fedora", hasSystemd: true },
  arch: { family: "arch", id: "arch", hasSystemd: true },
  leap: { family: "suse", id: "opensuse-leap", hasSystemd: true },
  tumbleweed: { family: "suse", id: "opensuse-tumbleweed", hasSystemd: true },
  alpine: { family: "alpine", id: "alpine", hasSystemd: false },
  void: { family: "void", id: "void", hasSystemd: false },
  gentoo: { family: "gentoo", id: "gentoo", hasSystemd: false },
  ostree: { family: "fedora", id: "bazzite", imageBased: true, hasSystemd: true },
};

// ---------------------------------------------------------------- updates ----

test("updates/pending: Leap gets an update, Tumbleweed gets the dist-upgrade", () => {
  assert.equal(emit("updates/pending", SYS.leap), "sudo zypper up");
  assert.equal(emit("updates/pending", SYS.tumbleweed), "sudo zypper dup");
});

test("updates/pending: no upgrade command for systems whose package manager the check never reads", () => {
  assert.deepEqual(cmds("updates/pending", SYS.void), []);
  assert.deepEqual(cmds("updates/pending", SYS.gentoo), []);
});

test("updates/pending: Alpine gets an apk command, image systems the atomic one", () => {
  assert.match(emit("updates/pending", SYS.alpine), /^sudo apk /);
  assert.equal(emit("updates/pending", SYS.ostree), "rpm-ostree upgrade");
});

// ---------------------------------------------------------------- orphans ----

test("orphans: openSUSE gets no bulk autoremove (zypper has no such command)", () => {
  for (const code of ["orphans/many", "orphans/some"]) {
    assert.ok(!/\bdnf\b/.test(emit(code, SYS.leap)), `${code} must not emit dnf on openSUSE`);
    assert.deepEqual(cmds(code, SYS.leap), [], `${code}: openSUSE has no bulk command to offer`);
  }
});

test("orphans: families with a real autoremove still get it", () => {
  assert.match(emit("orphans/many", SYS.debian), /apt autoremove/);
  assert.match(emit("orphans/some", SYS.debian), /apt autoremove/);
  assert.match(emit("orphans/some", SYS.fedora), /dnf autoremove/);
  assert.match(emit("orphans/some", SYS.arch), /pacman -Rns/);
});

// ---------------------------------------------------------------- locales ----

test("locales/broken: only systemd families are told to use localectl", () => {
  assert.ok(!/localectl/.test(emit("locales/broken", SYS.void)));
  assert.ok(!/localectl/.test(emit("locales/broken", SYS.gentoo)));
  assert.deepEqual(cmds("locales/broken", SYS.alpine), [], "musl has no locale generation");
  assert.deepEqual(cmds("locales/broken", SYS.void), [], "Void needs a config edit before any command");
});

test("locales/broken: each glibc family gets the command its distro documents", () => {
  assert.match(emit("locales/broken", SYS.debian), /locale-gen/);
  assert.match(emit("locales/broken", SYS.arch), /locale-gen/);
  assert.match(emit("locales/broken", SYS.gentoo), /locale-gen/);
  assert.match(emit("locales/broken", SYS.leap), /localectl/);
  assert.match(emit("locales/broken", SYS.fedora), /localectl/);
});

// ------------------------------------------------------------------ disk ----

test("disk/full: journal vacuum only where a journal exists, plus the family cache", () => {
  assert.match(emit("disk/full", SYS.alpine), /apk cache clean/);
  assert.ok(!/journalctl/.test(emit("disk/full", SYS.void)), "runit has no journalctl");
  assert.match(emit("disk/full", SYS.void), /xbps-remove -O/);
  assert.deepEqual(cmds("disk/full", SYS.gentoo), [], "no cache command that is safe to suggest");
});

// ------------------------------------------------------------------ boot ----

test("boot/full: old-kernel cleanup follows the family, never dnf/apt elsewhere", () => {
  assert.match(emit("boot/full", SYS.leap), /zypper purge-kernels/);
  assert.match(emit("boot/full", SYS.void), /vkpurge rm all/);
  for (const sys of [SYS.arch, SYS.alpine, SYS.gentoo]) {
    assert.ok(!/\bdnf\b|\bapt\b/.test(emit("boot/full", sys)), `dnf/apt must not appear for ${sys.id}`);
  }
});

// -------------------------------------------------------------- packages ----

test("packages/broken: repair is the family's own tool", () => {
  assert.match(emit("packages/broken", SYS.debian), /dpkg --configure -a/);
  assert.match(emit("packages/broken", SYS.leap), /zypper verify/);
  assert.match(emit("packages/broken", SYS.alpine), /apk fix/);
  assert.match(emit("packages/broken", SYS.void), /xbps-pkgdb -a/);
  assert.deepEqual(cmds("packages/broken", SYS.gentoo), []);
});

// ----------------------------------------------------------------- fstrim ----

test("fstrim/disabled: the enable command is systemd-only, so it is withheld elsewhere", () => {
  assert.match(emit("fstrim/disabled", SYS.fedora), /systemctl enable --now fstrim\.timer/);
  assert.deepEqual(cmds("fstrim/disabled", SYS.gentoo), []);
  assert.deepEqual(cmds("fstrim/disabled", SYS.void), []);
});

// ------------------------------------------------------- commands we cut ------

test("no fix command for advice that is not ours to execute", () => {
  // Enabling a firewall: no safe one-liner exists for every family (awall can
  // lock the user out), so the finding reports the state and the catalog is
  // silent. Installing a backup tool is advice, not a repair.
  for (const sys of Object.values(SYS)) {
    assert.deepEqual(cmds("security/no-firewall", sys), [], `firewall command for ${sys.id}`);
    assert.deepEqual(cmds("backup/none", sys), [], `backup-install command for ${sys.id}`);
  }
});

test("wifi/blocked: unblock via rfkill, which every family has", () => {
  const out = emit("wifi/blocked", SYS.alpine);
  assert.match(out, /rfkill unblock wifi/);
  assert.ok(!/nmcli/.test(out), "nmcli is not present on every family");
});

test("security/autologin: Debian's GDM path is named, not just Red Hat's", () => {
  assert.match(emit("security/autologin", SYS.debian), /gdm3/);
});
