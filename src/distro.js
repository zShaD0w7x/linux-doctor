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

  return { id, idLike, variant, family, pkg, imageBased, all };
}
