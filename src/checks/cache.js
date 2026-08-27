import { lines, num, fmtBytes } from "../utils.js";
import { defineCheck } from "./define.js";
import { finding } from "../findings.js";

/**
 * User cache and trash bloat.
 * `~/.cache` and `~/.local/share/Trash` grow silently for months
 * (browser caches, thumbnails, Flatpak, pip, npm). They are the
 * second most common cause of "disk full" on desktops after old
 * kernels — and `disk` only reports the final consequence.
 */
const CACHE_WARN = 5 * 1024 ** 3; // 5 GB
const CACHE_HIGH = 10 * 1024 ** 3; // 10 GB
const TRASH_WARN = 2 * 1024 ** 3; // 2 GB

export const cache = defineCheck({
  id: "cache",
  title: "Cache and trash",
  category: "system",
  appliesTo: ["desktop", "laptop"],
  async run(ctx) {
    const findings = [];

    const [cacheRes, trashRes] = await Promise.all([
      ctx.run("du -sb \"$HOME/.cache\" 2>/dev/null | cut -f1"),
      ctx.run("du -sb \"$HOME/.local/share/Trash\" 2>/dev/null | cut -f1"),
    ]);

    const cacheBytes = num(cacheRes.stdout);
    const trashBytes = num(trashRes.stdout);

    // Filter out empty/missing dirs (du prints nothing when dir absent)
    const hasCache = cacheRes.ok && cacheRes.stdout.trim() !== "" && cacheBytes >= 0;
    const hasTrash = trashRes.ok && trashRes.stdout.trim() !== "" && trashBytes >= 0;

    if (!hasCache && !hasTrash) return findings;

    if (hasCache && cacheBytes >= CACHE_HIGH) {
      findings.push(finding({
        severity: "medium",
        code: "cache/large",
        title: `User cache is very large (${fmtBytes(cacheBytes)})`,
        detail: `Your user cache at ~/.cache is using ${fmtBytes(cacheBytes)}. Browser caches, thumbnails, and build caches (pip, npm, Flatpak) accumulate for months and silently fill the disk.`,
        evidence: `~/.cache: ${fmtBytes(cacheBytes)}`,
        fix: "Review it with `du -sh ~/.cache/* | sort -rh | head -20` and clean stale entries (`rm -rf ~/.cache/thumbnails/*` is always safe; browser caches can be cleared from the browser).",
        confidence: "high",
      }));
    } else if (hasCache && cacheBytes >= CACHE_WARN) {
      findings.push(finding({
        severity: "info",
        code: "cache/large",
        title: `User cache is getting large (${fmtBytes(cacheBytes)})`,
        detail: `Your user cache at ~/.cache is using ${fmtBytes(cacheBytes)}. Not urgent yet, but worth a glance if disk space is tight.`,
        evidence: `~/.cache: ${fmtBytes(cacheBytes)}`,
        fix: "Check `du -sh ~/.cache/* | sort -rh | head -20` and remove what you no longer need.",
        confidence: "high",
      }));
    }

    if (hasTrash && trashBytes >= TRASH_WARN) {
      findings.push(finding({
        severity: trashBytes >= CACHE_HIGH ? "medium" : "info",
        code: "cache/trash",
        title: `Trash is using ${fmtBytes(trashBytes)}`,
        detail: `Your trash at ~/.local/share/Trash holds ${fmtBytes(trashBytes)}. Files in the trash still occupy disk space until you empty it.`,
        evidence: `~/.local/share/Trash: ${fmtBytes(trashBytes)}`,
        fix: "Empty it from your file manager or with `gio trash --empty` / `rm -rf ~/.local/share/Trash/*`.",
        confidence: "high",
      }));
    }

    if (findings.length === 0 && (hasCache || hasTrash)) {
      const parts = [];
      if (hasCache) parts.push(`cache ${fmtBytes(cacheBytes)}`);
      if (hasTrash) parts.push(`trash ${fmtBytes(trashBytes)}`);
      findings.push(finding({
        severity: "info",
        code: "cache/ok",
        title: "Cache and trash look fine",
        detail: `User cache and trash are modest (${parts.join(", ")}).`,
        evidence: parts.join(" · "),
        fix: null,
        confidence: "high",
      }));
    }

    return findings;
  },
});
