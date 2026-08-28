/**
 * Distro detection, in one place. Parses /etc/os-release fields (uppercase on
 * real systems, lowercase in test stubs) into a normalized profile that every
 * check can rely on instead of doing its own string matching.
 */
export function detectDistro(osRelease = {}) {
  const get = (k) =>
    String(osRelease[k] || osRelease[k.toUpperCase()] || osRelease[k.toLowerCase()] || "").toLowerCase();
  const id = get("id");
  const idLike = get("id_like");
  const variant = get("variant");
  const all = `${id} ${idLike} ${variant}`;

  // Image-based (ostree/atomic) distros update atomically via rpm-ostree,
  // and their root filesystem is virtual. Checked before family detection.
  const imageBased = /bazzite|silverblue|kinoite|sericea|bluefin|atomic|ostree/.test(all);

  // The specific atomic variant, so messages can name the distro ("Bazzite"
  // instead of a generic "immutable system"). null on classic distros.
  const variantMatch = all.match(/(bazzite|silverblue|kinoite|sericea|bluefin|aurora|cosmic-atomic|ublue|bootc)/);
  const atomicVariant = variantMatch ? variantMatch[1] : (imageBased ? "atomic" : null);

  let family = "other";
  if (id === "alpine") family = "alpine";
  else if (id === "void") family = "void";
  else if (id === "gentoo") family = "gentoo";
  else if (id === "arch" || /manjaro|endeavouros/.test(id) || /arch/.test(idLike)) family = "arch";
  else if (/suse|opensuse/.test(`${id} ${idLike}`)) family = "suse";
  else if (id === "debian" || id === "ubuntu" || /debian|ubuntu/.test(idLike)) family = "debian";
  else if (/fedora|rhel|centos|rocky|almalinux|nobara|bazzite|silverblue|kinoite/.test(all)) family = "fedora";

  let pkg = "unknown";
  if (imageBased) pkg = "rpm-ostree";
  else if (family === "fedora") pkg = "dnf";
  else if (family === "debian") pkg = "apt";
  else if (family === "arch") pkg = "pacman";
  else if (family === "suse") pkg = "zypper";
  else if (family === "alpine") pkg = "apk";
  else if (family === "void") pkg = "xbps";
  else if (family === "gentoo") pkg = "emerge";

  return { id, idLike, variant, family, pkg, imageBased, atomicVariant, all };
}

/**
 * Central distro-specific install helper — single source of truth for fix strings.
 * `pkgs` can be:
 *   - a string ("pipewire") or array (["podman","buildah"]) when the package
 *     has the same name everywhere, or
 *   - an object mapping package-manager/family → name for packages that are
 *     named differently across distros ({ fedora: "procps-ng", "*": "procps" }).
 *     Keys are matched against dist.pkg first (dnf/apt/pacman/zypper/apk/
 *     rpm-ostree), then dist.family, then "*" as the fallback.
 * Returns a copy-pasteable `sudo ... install` line for the current distro.
 * Keeps fix messages from drifting across 20+ checks.
 */
export function pkgInstall(dist, pkgs) {
  if (pkgs && typeof pkgs === "object" && !Array.isArray(pkgs)) {
    const pick = pkgs[dist?.pkg] ?? pkgs[dist?.family] ?? pkgs["*"];
    if (!pick) throw new Error(`pkgInstall: no package name for ${dist?.pkg || dist?.family || "unknown"} and no "*" fallback`);
    return pkgInstall(dist, pick);
  }
  const list = Array.isArray(pkgs) ? pkgs.join(" ") : String(pkgs);
  const p = dist?.pkg;
  // An unknown manager must never degrade to a wrong command — on NixOS or an
  // exotic system, "sudo dnf install" is bad advice, not a fallback.
  if (!p || p === "unknown") {
    return `Manual step: install ${list} with your distribution's package manager (not recognized by linux-doctor).`;
  }
  if (p === "apt") return `sudo apt install ${list}`;
  if (p === "apk") return `sudo apk add ${list}`;
  if (p === "pacman") return `sudo pacman -S ${list}`;
  if (p === "zypper") return `sudo zypper install ${list}`;
  if (p === "xbps") return `sudo xbps-install -Sy ${list}`;
  if (p === "emerge") return `sudo emerge ${list}`;
  if (p === "rpm-ostree") return `sudo rpm-ostree install ${list}`;
  return `sudo dnf install ${list}`;
}
