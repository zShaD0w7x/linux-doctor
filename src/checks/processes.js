import { lines, num, fmtBytes } from "../utils.js";

/** Friendly names for common app processes. */
const FRIENDLY = {
  brave: "the Brave browser",
  firefox: "the Firefox browser",
  chromium: "the Chromium browser",
  chrome: "the Chrome browser",
  telegram: "Telegram",
  "QtWebEngineProcess": "an embedded web view (often part of a desktop app)",
  code: "VS Code",
  node: "a Node.js process",
  steam: "Steam",
  discord: "Discord",
  plasma: "the KDE desktop shell",
  gnome: "the GNOME desktop shell",
};

export const processes = {
  id: "processes",
  title: "Top memory consumers",
  async run(ctx) {
    const findings = [];
    const [psRes, memRes] = await Promise.all([ctx.run(`ps -eo comm,rss --sort=-rss 2>/dev/null | head -8`), ctx.run(`free -b`),
    ]);
    if (!psRes.ok) return findings;

    const rows = lines(psRes.stdout).slice(1).slice(0, 3).map((l) => {
      const [name, rss] = l.split(/\s+/);
      return { name: name || "unknown", rss: num(rss) };
    });
    if (rows.length === 0) return findings;

    const memLine = lines(memRes.stdout || "").find((l) => l.startsWith("Mem:"));
    const total = memLine ? num(memLine.split(/\s+/)[1]) : 0;
    const top = rows[0];
    const ratio = total > 0 ? top.rss / total : 0;

    if (top.rss > 0 && ratio > 0.4) {
      findings.push({
        severity: "high",
        title: "A single app is using a huge amount of memory",
        detail: `${FRIENDLY[top.name] || `The \`${top.name}\` process`} is using ${fmtBytes(top.rss)}, which is more than 40% of your total RAM. This is very likely why the system feels slow.`,
        evidence: rows.map((r) => `${r.name}\t${fmtBytes(r.rss)}`).join("\n"),
        fix: "Close unused tabs or quit that app now, then re-run this check.",
        confidence: "high",
      });
    } else if (top.rss > 0 && ratio > 0.2) {
      findings.push({
        severity: "medium",
        title: "A single app is using a lot of memory",
        detail: `${FRIENDLY[top.name] || `The \`${top.name}\` process`} is using ${fmtBytes(top.rss)}, which is more than 20% of your total RAM. This is the most likely reason the system feels slow.`,
        evidence: rows.map((r) => `${r.name}\t${fmtBytes(r.rss)}`).join("\n"),
        fix: "Close unused tabs or quit that app and re-run this check.",
        confidence: "high",
      });
    } else {
      findings.push({
        severity: "info",
        title: "Top memory consumers",
        detail: "The largest memory users right now are listed below. This is normal unless the system is under pressure.",
        evidence: rows.map((r) => `${r.name}\t${fmtBytes(r.rss)}`).join("\n"),
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
};
