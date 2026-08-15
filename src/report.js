import { systemInfo } from "./checks/system.js";

export const SEV_ORDER = ["high", "medium", "info"];
export const SEV_LABEL = {
  high: "🔴 HIGH",
  medium: "🟡 MEDIUM",
  info: "⚪ INFO",
};

export function countBySeverity(findings) {
  return SEV_ORDER.map((s) => ({ severity: s, count: findings.filter((f) => f.severity === s).length }));
}

/** Render the full terminal report in American English. */
export async function renderReport(findings, { aiSummary } = {}) {
  const info = await systemInfo();
  const out = [];

  out.push("🩺 Linux Doctor");
  out.push("==============");
  out.push(`System: ${info.distro} · Kernel ${info.kernel} · ${info.cores} core(s) · up ${info.uptime}`);
  if (info.immutable) out.push("Note: this is an immutable (ostree) system; the root filesystem is virtual, so a 100% root is expected and normal.");
  out.push("");

  if (aiSummary) {
    out.push(aiSummary);
    out.push("");
  }

  const counts = countBySeverity(findings);
  const high = counts.find((c) => c.severity === "high").count;
  const med = counts.find((c) => c.severity === "medium").count;
  const inf = counts.find((c) => c.severity === "info").count;

  if (high === 0 && med === 0) {
    out.push("✅ Your system looks healthy. No high or medium issues found.");
  } else {
    out.push(`Found ${high} high-severity, ${med} medium-severity, and ${inf} informational finding(s).`);
  }
  out.push("");

  let n = 0;
  for (const sev of SEV_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    out.push(`${SEV_LABEL[sev]}`);
    out.push("-".repeat(SEV_LABEL[sev].length));
    for (const f of group) {
      n += 1;
      out.push("");
      out.push(`${n}. ${f.title}`);
      if (f.detail) out.push(`   ${f.detail}`);
      if (f.evidence) {
        out.push("");
        out.push("   Evidence:");
        for (const line of String(f.evidence).split("\n").slice(0, 8)) out.push(`     $ ${line}`);
      }
      if (f.fix) {
        out.push("");
        out.push(`   How to fix: ${f.fix}`);
      }
      out.push("");
    }
  }

  out.push("──────────────────────────────");
  out.push("Linux Doctor only reads system information — it never modifies anything.");
  out.push("Report bugs or request checks at: github.com/your-name/linux-doctor");
  return out.join("\n");
}

/** Render findings as JSON (machine-readable). */
export function renderJson(findings) {
  return JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2);
}
