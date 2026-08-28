/* === Markdown export — scrubbed, share-ready === */
function scrub(text) {
  if (!text) return text;
  return String(text)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g, "<ip-redacted>")
    .replace(/(?:[0-9A-Fa-f]{0,4}:){2,}[0-9A-Fa-f]{0,4}\b/g, (m) => /::|[A-Fa-f]/.test(m) ? "<ip-redacted>" : m)
    .replace(/\bfe80::[0-9A-Fa-f:]*\b/gi, "<ip-redacted>")
    .replace(/::1\b/g, "<ip-redacted>")
    .replace(/\/(home|Users)\/[^\/\s]+/g, "/$1/<user-redacted>")
    .replace(/\/run\/user\/\d+/g, "/run/user/<uid-redacted>");
}
function reportMarkdown(data) {
  const { system = {}, findings = [] } = data;
  const lines = [];
  // Markdown viewers (GitHub, VSCode…) render emoji from their own fonts,
  // so the stethoscope is safe — and wanted — here, unlike inside the app UI.
  lines.push("# \u{1fa7a} Linux Doctor report");
  lines.push("");
  lines.push("- **System:** " + [scrub(system.distro), scrub(system.kernel), (system.cores || "?") + " core(s)", "up " + scrub(system.uptime)].filter(Boolean).join(" \u00b7 "));
  if (typeof data.score === "number") {
    lines.push("- **Health:** " + data.score + "/100" +
      (typeof data.scoreDelta === "number" ? " (" + (data.scoreDelta > 0 ? "+" + data.scoreDelta : data.scoreDelta) + " since last check)" : ""));
  }
  lines.push("- **Checks:** " + (data.checksRun ?? "?") + " ran, " + (data.checksSkipped ?? 0) + " skipped");
  lines.push("");
  lines.push("_IPs and home paths are redacted — safe to paste in public._");
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
      lines.push((count) + ". **" + scrub(f.title || "") + "**" + (f.code ? " (`" + scrub(f.code) + "`)" : ""));
      if (f.detail) lines.push("   - Detail: " + scrub(f.detail));
      if (f.evidence) lines.push("   - Evidence: " + scrub(f.evidence));
      if (f.fix) lines.push("   - Fix: " + scrub(f.fix));
      lines.push("");
    }
  }
  if (!count) lines.push("No findings.");
  return lines.join("\n");
}
function downloadMarkdown(data) {
  const text = reportMarkdown(data);
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = "linux-doctor-" + ts + ".md";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
