/* === System view: the machine wiki ===
   A complete, readable profile from the report payload — no new probes, no
   new endpoints. Sections mirror how admins actually ask about a box: what
   OS, what hardware, what session. Rendered on every report so the view
   never goes stale behind Overview. */

function fmtGB(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return null;
  return (bytes / 1024 ** 3).toFixed(1) + " GB";
}

function systemType(sys) {
  if (sys.atomicVariant) return "immutable (" + sys.atomicVariant + ")";
  if (sys.imageBased || sys.immutable) return "immutable";
  return "classic";
}

function systemFactsHtml(data) {
  const sys = data.system || {};
  const counts = { high: 0, medium: 0, info: 0 };
  for (const f of data.findings || []) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const fact = (k, v) => '<div class="sysfact"><span class="sysfact-k">' + k + "</span>" +
    '<span class="sysfact-v">' + esc(v == null || v === "" ? "—" : String(v)) + "</span></div>";
  const card = (title, sub, body) => '<div class="viewcard"><div class="mx-head">' + title + "</div>" +
    '<div class="mx-sub">' + sub + "</div>" + body + "</div>";

  const mem = fmtGB(sys.memTotalBytes);
  const cpu = [sys.cpuModel, sys.cores && sys.cores !== "unknown" ? sys.cores + " cores" : null]
    .filter(Boolean).join(" · ") || null;
  return card("Operating system", "What software this machine runs",
    fact("Distribution", sys.distro) +
    fact("Version", (sys.osRelease || {}).VERSION_ID) +
    fact("Family", sys.family) +
    fact("Architecture", sys.arch) +
    fact("Kernel", sys.kernel) +
    fact("System type", systemType(sys)) +
    fact("Package manager", (sys.atomic || {}).pkg)) +
  card("Hardware", "What this machine is",
    fact("CPU", cpu) +
    fact("Memory", mem) +
    fact("Hostname", sys.hostname)) +
  card("Session", "How this machine is running right now",
    fact("Uptime", sys.uptime) +
    fact("Profile", sys.kind) +
    fact("Desktop", sys.desktop) +
    fact("Session type", sys.sessionType)) +
  card("This report", "Generated " + esc(data.generatedAt || "—"),
    fact("Health score", typeof data.score === "number" ? data.score + "/100" : "—") +
    fact("Findings", counts.high + " high · " + counts.medium + " medium · " + counts.info + " info") +
    fact("Checks", (data.checksRun != null ? data.checksRun + " ran" : "—") +
      (data.checksSkipped ? " · " + data.checksSkipped + " skipped" : "")));
}

function renderSystemView(data) {
  const box = $("#systemview");
  if (!box) return;
  box.innerHTML = systemFactsHtml(data || {});
}
