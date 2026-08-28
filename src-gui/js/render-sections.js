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
  const sevLabel = [];
  if (counts.high) sevLabel.push(counts.high + " high");
  if (counts.medium) sevLabel.push(counts.medium + " medium");
  if (counts.info) sevLabel.push(counts.info + " info");
  const worst = sec.some((f) => f.severity === "high") ? "high" : sec.some((f) => f.severity === "medium") ? "medium" : "info";
  const tone = worst === "high" ? "warn" : worst === "medium" ? "warn" : "calm";
  el.hidden = false;
  el.className = "security-posture " + tone;
  el.innerHTML =
    '<div class="sp-icon" aria-hidden="true">' + catIcon("security", 18) + '</div>' +
    '<div class="sp-body"><div class="sp-title">Security posture &middot; ' + sec.length + ' finding' + (sec.length > 1 ? "s" : "") + '</div>' +
    '<div class="sp-hint">' + esc(sevLabel.join(" \u00b7 ") || "review") + ' across firewall, SSH, login & boot checks</div></div>' +
    '<button data-spjump>Show security findings</button>';
  el.querySelector("[data-spjump]")?.addEventListener("click", () => {
    activeFilter = "all";
    document.querySelectorAll(".fpill").forEach((b) => b.classList.toggle("active", b.dataset.sev === "all"));
    // Switch to category view so the security group is together, then scroll to it
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
  const hint = firstSentence(pick.fix);
  el.hidden = false;
  el.innerHTML =
    '<span class="nh-icon">\u25b6 START HERE</span>' +
    '<div class="nh-body"><div class="nh-title">' + esc(pick.title) + '</div>' +
    '<div class="nh-hint">' + esc(hint.length > 160 ? hint.slice(0, 159) + "\u2026" : hint) + '</div></div>' +
    '<button data-nhcopy="' + esc(pick.fix) + '">\u22b1 Copy fix</button>' +
    '<button data-nhjump="' + esc(pick.code || "") + '">\u2198 Show</button>';
}

function renderCheckErrors(data) {
  const el = $("#checkerrors");
  if (!el) return;
  const errors = data.checkErrors || [];
  el.hidden = !errors.length;
  if (!errors.length) return;
  $("#checkerrors-count").textContent = errors.length;
  $("#checkerrors-body").innerHTML = errors.map((e) =>
    '<div class="card medium"><summary><span class="badge medium">failed</span>' +
    '<h3>' + esc(e.check) + '</h3><span class="chev">\u25b8</span></summary>' +
    '<div class="card-body"><div class="detail">' + esc(e.error || "unknown error") + '</div></div></div>'
  ).join("");
}

function renderFixed(data) {
  const el = $("#fixed");
  const fixed = (data.diffSinceLast && data.diffSinceLast.fixed) || [];
  el.hidden = !fixed.length;
  if (!fixed.length) return;
  $("#fixed-count").textContent = fixed.length;
  $("#fixed-body").innerHTML = fixed.map((f) =>
    '<div class="card ' + (f.severity || "") + '"><summary><span class="badge fixedbadge">fixed</span>' +
    '<h3>' + esc(f.title) + '</h3>' +
    (f.code ? '<span class="checkid">' + esc(f.code) + "</span>" : "") +
    '<span class="chev">\u25b8</span></summary>' +
    '<div class="card-body"><div class="detail">This no longer shows up in the report.</div></div></div>'
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
  $("#diff-count").textContent = total + " (" + added.length + " new \u00b7 " + fixed.length + " fixed)";
  const row = (f, cls, badge) => '<div class="card ' + (f.severity || "") + '"><summary><span class="badge ' + cls + '">' + badge + '</span>' +
    '<h3>' + esc(f.title) + '</h3>' + (f.code ? '<span class="checkid">' + esc(f.code) + '</span>' : "") + '<span class="chev">\u25b8</span></summary>' +
    '<div class="card-body"><div class="detail">' + esc(f.detail || (cls === "high" ? "New since last run" : "Fixed since last run")) + '</div></div></div>';
  let html = "";
  if (added.length) html += '<div style="grid-column:1/-1; font-size:12px; font-weight:700; color:var(--red); margin-bottom:2px;">\u25cf New (' + added.length + ')</div>' + added.map(f => row(f, f.severity || "high", "NEW")).join("");
  if (fixed.length) html += '<div style="grid-column:1/-1; font-size:12px; font-weight:700; color:var(--green); margin: 8px 0 2px;">\u25cf Fixed (' + fixed.length + ')</div>' + fixed.map(f => row(f, f.severity || "info", "FIXED")).join("");
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
    '<div class="card info"><summary><span class="badge info">skipped</span>' +
    '<h3>' + esc(c.title) + '</h3><span class="checkid">' + esc(c.id) + '</span>' +
    '<span class="chev">\u25b8</span></summary>' +
    '<div class="card-body"><div class="detail">' + esc(c.reason) + '</div></div></div>'
  ).join("");
}
