/* === Sections: next step, fixed, diff, skipped, check errors === */
function firstSentence(text) {
  return String(text || "").split(/(?<=\.)\s/)[0].trim();
}

function renderSecurityPosture(data) {
  const el = $("#security-posture");
  if (!el) return;
  const sec = securityPostureFindings(data.findings || []);
  if (!sec.length) { el.hidden = true; el.innerHTML = ""; return; }
  const counts = { high: 0, medium: 0, info: 0 };
  for (const f of sec) counts[f.severity] = (counts[f.severity] || 0) + 1;
  // Only visually compete if high-severity security issue is present
  const hasHigh = counts.high > 0;
  const hasMedium = counts.medium > 0;
  if (!hasHigh && !hasMedium) {
    // Quiet informational: show as subtle line, not competing card
    el.hidden = false;
    el.className = "security-posture";
    el.innerHTML =
      '<div class="sp-icon" aria-hidden="true" style="opacity:.5">' + catIcon("security", 16) + '</div>' +
      '<div class="sp-body"><div class="sp-title" style="font-weight:500;color:var(--muted2)">' + sec.length + ' security observations</div>' +
      '<div class="sp-hint">' + sec.length + ' informational findings — no action needed</div></div>' +
      '<button style="font-size:11px;padding:4px 8px;background:transparent;border:1px solid var(--border);color:var(--muted2);border-radius:7px" data-spjump>View</button>';
  } else {
    const tone = hasHigh ? "high" : "warn";
    el.hidden = false;
    el.className = "security-posture " + tone;
    const label = hasHigh ? counts.high + " high" : hasMedium ? counts.medium + " warning" + (counts.medium > 1 ? "s" : "") : "";
    el.innerHTML =
      '<div class="sp-icon" aria-hidden="true">' + catIcon("security", 18) + '</div>' +
      '<div class="sp-body"><div class="sp-title">Security posture &middot; ' + sec.length + ' finding' + (sec.length > 1 ? "s" : "") + '</div>' +
      '<div class="sp-hint">' + esc(label + (counts.info ? " · " + counts.info + " info" : "") + ' — firewall, SSH, login & boot') + '</div></div>' +
      '<button data-spjump>Review security</button>';
  }
  el.querySelector("[data-spjump]")?.addEventListener("click", () => {
    activeFilter = "all";
    document.querySelectorAll(".fpill").forEach((b) => b.classList.toggle("active", b.dataset.sev === "all"));
    setGroupBy("category");
    requestAnimationFrame(() => {
      applyFilters();
      scrollToGroup("cat", "security");
    });
  }, { once: true });
}

function renderNextStep(data) {
  const el = $("#nexthep");
  if (!el) return;
  const order = { high: 0, medium: 1, info: 2 };
  const pick = data.nextAction
    || [...(data.findings || [])].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)).find((f) => f.fix);
  if (!pick || !pick.fix) { el.hidden = true; return; }

  // Find the full finding for evidence/detail
  const full = (data.findings || []).find((f) => f.code === pick.code) || pick;
  const detail = full.detail || pick.detail || "";
  const evidence = full.evidence || "";
  const code = pick.code || full.code || "";
  const sev = pick.severity || full.severity || "medium";
  const sevLabel = sev === "high" ? "High priority" : sev === "medium" ? "Recommended" : "Informational";

  el.hidden = false;
  el.innerHTML =
    '<div class="nh-header"><span class="nh-icon">START HERE</span><span class="nh-kicker">Most urgent · ' + esc(sevLabel) + '</span><span style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--muted2)">' + esc(code) + '</span></div>' +
    '<div class="nh-body">' +
      '<div class="nh-title">' + esc(pick.title) + '</div>' +
      (code ? '<div style="font-family:var(--mono);font-size:11px;color:var(--muted2);margin-top:4px">' + esc(code) + '</div>' : '') +
      '<div class="nh-section"><div class="nh-section-label">What happened</div><div class="nh-hint">' + esc(detail || "An issue was detected that needs attention.") + '</div></div>' +
      (evidence ? '<div class="nh-section"><div class="nh-section-label">Evidence</div><div style="font-family:var(--mono);font-size:11px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;overflow:auto;max-height:120px;white-space:pre-wrap;color:var(--muted)">' + esc(String(evidence).split("\n").slice(0,5).join("\n")) + '</div></div>' : '') +
      '<div class="nh-section"><div class="nh-section-label">Why it matters</div><div class="nh-hint">' + esc(detail ? detail.split(".")[0] + "." : "Repeated issues may indicate a broken package, driver, or configuration.") + '</div></div>' +
      '<div class="nh-section"><div class="nh-section-label">Recommended next step</div><div class="nh-hint">' + esc(firstSentence(pick.fix).slice(0, 160)) + '</div></div>' +
      '<div class="nh-actions">' +
        // Primary: actually inspect — jumps to the finding card (delegated handler)
        (code ? '<button data-nhjump="' + esc(code) + '" style="background:var(--green);border-color:var(--green);color:#06231a">Inspect details</button>' : '') +
        // Secondary: single copy path via the delegated [data-nhcopy] handler in init.js
        '<button data-nhcopy="' + esc(pick.fix) + '" style="background:var(--card);border:1px solid var(--border);color:var(--text)">Copy fix</button>' +
      '</div>' +
    '</div>';
}

function renderCheckErrors(data) {
  const el = $("#checkerrors");
  if (!el) return;
  const errors = data.checkErrors || [];
  el.hidden = !errors.length;
  if (!errors.length) return;
  $("#checkerrors-count").textContent = errors.length;
  $("#checkerrors-body").innerHTML = errors.map((e) =>
    '<details class="card medium"><summary><span class="badge medium">failed</span>' +
    '<h3>' + esc(e.check) + '</h3><span class="chev">▸</span></summary>' +
    '<div class="card-body"><div class="detail">' + esc(e.error || "unknown error") + '</div></div></details>'
  ).join("");
}

function renderFixed(data) {
  const el = $("#fixed");
  const fixed = (data.diffSinceLast && data.diffSinceLast.fixed) || [];
  el.hidden = !fixed.length;
  if (!fixed.length) return;
  $("#fixed-count").textContent = fixed.length;
  $("#fixed-body").innerHTML = fixed.map((f) =>
    '<details class="card ' + (f.severity || "") + '"><summary><span class="badge fixedbadge">fixed</span>' +
    '<h3>' + esc(f.title) + '</h3>' +
    (f.code ? '<span class="checkid">' + esc(f.code) + "</span>" : "") +
    '<span class="chev">▸</span></summary>' +
    '<div class="card-body"><div class="detail">This no longer shows up in the report.</div></div></details>'
  ).join("");
}

function renderDiff(data) {
  const el = $("#diff");
  if (!el) return;
  const added = (data.diffSinceLast && data.diffSinceLast.added) || [];
  const fixed = (data.diffSinceLast && data.diffSinceLast.fixed) || [];
  const total = added.length + fixed.length;
  el.hidden = total === 0;
  if (!total) return;
  $("#diff-count").textContent = total + " (" + added.length + " new · " + fixed.length + " fixed)";
  const row = (f, cls, badge) => '<details class="card ' + (f.severity || "") + '"><summary><span class="badge ' + cls + '">' + badge + '</span>' +
    '<h3>' + esc(f.title) + '</h3>' + (f.code ? '<span class="checkid">' + esc(f.code) + '</span>' : "") + '<span class="chev">▸</span></summary>' +
    '<div class="card-body"><div class="detail">' + esc(f.detail || (cls === "high" ? "New since last run" : "Fixed since last run")) + '</div></div></details>';
  let html = "";
  if (added.length) html += '<div style="grid-column:1/-1; font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--red); margin-bottom:4px;">● New (' + added.length + ')</div>' + added.map(f => row(f, f.severity || "high", "NEW")).join("");
  if (fixed.length) html += '<div style="grid-column:1/-1; font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--green); margin: 10px 0 4px;">● Fixed (' + fixed.length + ')</div>' + fixed.map(f => row(f, f.severity || "info", "FIXED")).join("");
  $("#diff-body").innerHTML = html;
}

async function renderSkipped() {
  if (STATIC_DATA) return;
  const box = $("#skipped");
  const checks = await fetchChecks();
  const byId = new Map();
  for (const c of checks.filter((c) => !c.appliesHere)) {
    byId.set(c.id, { id: c.id, title: c.title, reason: "Only runs on: " + c.appliesTo.join(", ") + "." });
  }
  const atomic = (typeof lastReportData !== "undefined" && lastReportData && lastReportData.skippedChecks) || [];
  for (const s of atomic) {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, title: s.title, reason: s.reason || "Not applicable on this immutable/atomic system." });
  }
  const skipped = [...byId.values()];
  box.hidden = !skipped.length;
  if (!skipped.length) return;
  $("#skipped-count").textContent = skipped.length;
  $("#skipped-body").innerHTML = skipped.map((c) =>
    '<details class="card info"><summary><span class="badge info">skipped</span>' +
    '<h3>' + esc(c.title) + '</h3><span class="checkid">' + esc(c.id) + '</span>' +
    '<span class="chev">▸</span></summary>' +
    '<div class="card-body"><div class="detail">' + esc(c.reason) + '</div></div></details>'
  ).join("");
}
