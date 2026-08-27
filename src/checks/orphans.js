import { lines } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * Orphaned / unneeded packages — the #1 "how to free space on Arch"
 * answer on r/archlinux (`pacman -Rns $(pacman -Qtdq)`). Other families
 * have the same concept (dnf autoremove, apt autoremove). A pile of
 * orphans is not a fault, but a latent disk/bloat risk that `disk`
 * only catches after the fact.
 */
export const orphans = defineCheck({
  id: "orphans",
  title: "Orphaned packages",
  category: "system",
  async run(ctx) {
    const { pkg, family } = ctx.dist || {};
    let count = 0;
    let evidence = "";
    let sample = "";

    if (pkg === "pacman" || family === "arch") {
      const res = await ctx.run("pacman -Qtdq 2>/dev/null");
      const pkgs = lines(res.stdout);
      count = pkgs.length;
      sample = pkgs.slice(0, 5).join(", ");
      evidence = pkgs.slice(0, 5).join("\n") || "pacman -Qtdq: none";
    } else if (pkg === "apt" || family === "debian") {
      const res = await ctx.run("apt-get -s autoremove 2>/dev/null | grep -E '^Remv ' | wc -l");
      count = Number(lines(res.stdout)[0] || 0);
      const list = await ctx.run("apt-get -s autoremove 2>/dev/null | grep -E '^Remv ' | head -5");
      sample = lines(list.stdout).slice(0, 3).join("\n");
      evidence = `apt autoremove --dry-run: ${count} removable`;
      if (sample) evidence += `\n${sample}`;
    } else if (pkg === "dnf" || family === "fedora") {
      // dnf5: `dnf repoquery --unneeded` ; dnf4: `package-cleanup --orphans`
      // Try dnf5 first, fall back to dnf autoremove --assumeno parse.
      let res = await ctx.run("dnf repoquery --unneeded --qf '%{name}' 2>/dev/null | wc -l");
      if (res.ok && lines(res.stdout)[0] !== "") {
        count = Number(lines(res.stdout)[0] || 0);
        const list = await ctx.run("dnf repoquery --unneeded --qf '%{name}' 2>/dev/null | head -5");
        sample = lines(list.stdout).slice(0, 3).join(", ");
        evidence = `dnf repoquery --unneeded: ${count} orphaned`;
        if (sample) evidence += `\n${sample}`;
      } else {
        res = await ctx.run("dnf autoremove --assumeno 2>&1 | grep -E '^ Package ' | wc -l");
        count = Number(lines(res.stdout)[0] || 0);
        evidence = `dnf autoremove --assumeno: ${count} removable`;
      }
    } else if (pkg === "zypper" || family === "suse") {
      const res = await ctx.run("zypper packages --unneeded 2>/dev/null | grep -c '^i'");
      count = Number(lines(res.stdout)[0] || 0);
      evidence = `zypper packages --unneeded: ${count} orphaned`;
    } else {
      // Unknown package manager — nothing to say (not a fault)
      return [];
    }

    if (count === 0) {
      return [finding({
        severity: "info",
        code: "orphans/none",
        title: "No orphaned packages",
        detail: "No unneeded/orphaned packages were found. The package database is tidy.",
        evidence: evidence || "0 orphaned",
        fix: null,
        confidence: "high",
      })];
    }

    if (count >= 10) {
      return [finding({
        severity: "medium",
        code: "orphans/many",
        title: `${count} orphaned packages are installed`,
        detail: `${count} packages are installed as dependencies but no longer required by any package. They waste disk space and slow down updates. This is especially common on Arch after removing a desktop environment or kernel.`,
        evidence: sample ? `${evidence}\n${sample}` : evidence,
        fix: family === "arch" ? "Remove them with `sudo pacman -Rns $(pacman -Qtdq)` (review the list first with `pacman -Qtd`)."
          : family === "debian" ? "Remove them with `sudo apt autoremove`."
          : family === "fedora" ? "Remove them with `sudo dnf autoremove`."
          : "Remove them with your package manager's autoremove command.",
        confidence: "high",
      })];
    }

    return [finding({
      severity: "info",
      code: "orphans/some",
      title: `${count} orphaned package${count === 1 ? "" : "s"} installed`,
      detail: `${count} package${count === 1 ? " is" : "s are"} installed as dependencies but no longer required. Not urgent, but worth cleaning up.`,
      evidence: sample ? `${evidence}\n${sample}` : evidence,
      fix: family === "arch" ? "Remove with `sudo pacman -Rns $(pacman -Qtdq)` after reviewing `pacman -Qtd`."
        : family === "debian" ? "Remove with `sudo apt autoremove`."
        : "Remove with `sudo dnf autoremove` or your distro's equivalent.",
      confidence: "high",
    })];
  },
});
