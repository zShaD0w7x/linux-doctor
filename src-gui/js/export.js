/* === Markdown export === */
function reportMarkdown(data) {
  const { system = {}, findings = [] } = data;
  const lines = [];
  lines.push("# Linux Doctor report");
  lines.push("");
  lines.push("- **System:** " + [system.distro, system.kernel, (system.cores || "?") + " core(s)", "up " + system.uptime].filter(Boolean).join(" \u00b7 "));
  if (typeof data.score === "number") {
    lines.push("- **Health:** " + data.score + "/100" +
      (typeof data.scoreDelta === "number" ? " (" + (data.scoreDelta > 0 ? "+" + data.scoreDelta : data.scoreDelta) + " since last check)" : ""));
  }
  lines.push("- **Checks:** " + (data.checksRun ?? "?") + " ran, " + (data.checksSkipped ?? 0) + " skipped");
  lines.push("");
  const names = { high: "High severity", medium: "Medium severity", info: "Informational" };
  let count = 0;
  for (const sev of SEV_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    lines.push("## " + names[sev] + " (" + group.length + ")");
    lines.push("");
    for (const f of group) {
      count++;
      lines.push((count) + ". **" + (f.title || "") + "**" + (f.code ? " (`" + f.code + "`)" : ""));
      if (f.detail) lines.push("   - Detail: " + f.detail);
      if (f.evidence) lines.push("   - Evidence: " + f.evidence);
      if (f.fix) lines.push("   - Fix: " + f.fix);
      lines.push("");
    }
  }
  if (!count) lines.push("No findings.");
  return lines.join("\n");
}
