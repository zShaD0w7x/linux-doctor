import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDistro, pkgInstall } from "../src/distro.js";

test("pkgInstall: same-named packages produce the right command per package manager", () => {
  assert.equal(pkgInstall(detectDistro({ ID: "fedora" }), "smartmontools"), "sudo dnf install smartmontools");
  assert.equal(pkgInstall(detectDistro({ ID: "debian" }), "smartmontools"), "sudo apt install smartmontools");
  assert.equal(pkgInstall(detectDistro({ ID: "arch" }), "smartmontools"), "sudo pacman -S smartmontools");
  assert.equal(pkgInstall(detectDistro({ ID: "opensuse-tumbleweed" }), "x"), "sudo zypper install x");
  assert.equal(pkgInstall(detectDistro({ ID: "alpine" }), "x"), "sudo apk add x");
});

test("pkgInstall: atomic systems install via rpm-ostree", () => {
  const dist = detectDistro({ ID: "bazzite", ID_LIKE: "fedora" });
  assert.equal(dist.imageBased, true);
  assert.equal(pkgInstall(dist, "fastfetch"), "sudo rpm-ostree install fastfetch");
});

test("pkgInstall: array joins into one command", () => {
  assert.equal(pkgInstall(detectDistro({ ID: "ubuntu" }), ["podman", "buildah"]), "sudo apt install podman buildah");
});

test("pkgInstall: map form resolves per-distro package names by pkg first, then family, then *", () => {
  // fedora family: the dnf key wins over the family key.
  const fedora = detectDistro({ ID: "fedora" });
  assert.equal(pkgInstall(fedora, { dnf: "procps-ng", debian: "procps", "*": "procps" }), "sudo dnf install procps-ng");
  // debian: falls through to the explicit debian key.
  const ubuntu = detectDistro({ ID: "ubuntu" });
  assert.equal(pkgInstall(ubuntu, { dnf: "iproute", "*": "iproute2" }), "sudo apt install iproute2");
  // arch: no arch/debian key — the "*" fallback applies.
  const arch = detectDistro({ ID: "arch" });
  assert.equal(pkgInstall(arch, { dnf: "procps-ng", "*": "procps" }), "sudo pacman -S procps");
});

test("pkgInstall: a missing key without * is a loud error, not a wrong command", () => {
  assert.throws(() => pkgInstall(detectDistro({ ID: "fedora" }), { debian: "procps" }));
});

test("pkgInstall: void and gentoo get native commands, not guesses", () => {
  assert.equal(pkgInstall(detectDistro({ ID: "void" }), "smartmontools"), "sudo xbps-install -Sy smartmontools");
  assert.equal(pkgInstall(detectDistro({ ID: "gentoo" }), "smartmontools"), "sudo emerge smartmontools");
});

test("pkgInstall: an unknown distribution gets an honest manual step, never a wrong command", () => {
  // NixOS (and other unrecognized systems) must not be told to run dnf.
  const out = pkgInstall(detectDistro({ ID: "nixos" }), "fastfetch");
  assert.match(out, /fastfetch/);
  assert.match(out, /package manager/i);
  assert.doesNotMatch(out, /sudo dnf/);
  assert.doesNotMatch(out, /sudo apt/);
});
