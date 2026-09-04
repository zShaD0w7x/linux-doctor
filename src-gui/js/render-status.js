/* === Status zone: gauge, score, status message — PREMIUM HIERARCHY === */
const SCORE_RING_R = 26;
const SCORE_RING_C = 2 * Math.PI * SCORE_RING_R;

function renderGauge(score, size) {
  const s = size || 96;
  const scoreColor = score >= 80 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)";
  return '<div class="gauge' + (s > 96 ? ' large' : '') + '" style="width:' + s + 'px;height:' + s + 'px">' +
    '<svg viewBox="0 0 62 62" role="img" aria-label="Health score ' + score + ' of 100">' +
    '<circle class="track" cx="31" cy="31" r="' + SCORE_RING_R + '"></circle>' +
    '<circle class="ring" id="scorering" cx="31" cy="31" r="' + SCORE_RING_R + '" ' +
    'transform="rotate(-90 31 31)" stroke="' + scoreColor + '" ' +
    'stroke-dasharray="' + SCORE_RING_C + '" stroke-dashoffset="' + SCORE_RING_C + '"></circle>' +
    '</svg>' +
    '<div class="gauge-center"><div class="scorenum" id="scorenum">0</div><div class="scoreout">/100</div></div>' +
    '</div>';
}

function animateScore(target) {
  const num = $("#scorenum");
  const ring = $("#scorering");
  if (!num) return;
  let reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch {}
  if (reduce) {
    num.textContent = target;
    if (ring) ring.style.strokeDashoffset = SCORE_RING_C * (1 - target / 100);
    return;
  }
  const t0 = performance.now();
  const dur = 900;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const v = target * (1 - Math.pow(1 - p, 3));
    num.textContent = Math.round(v);
    if (ring) ring.style.strokeDashoffset = SCORE_RING_C * (1 - v / 100);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderStatusMessage(findings) {
  const high = findings.filter((f) => f.severity === "high").length;
  const med = findings.filter((f) => f.severity === "medium").length;
  const inf = findings.filter((f) => f.severity === "info").length;
  let headline, sublabel, level;
  if (high + med === 0) {
    if (findings.length === 0) {
      headline = "Healthy";
      sublabel = "No high or medium issues — no issues detected";
    } else {
      headline = "Healthy";
      sublabel = "No high or medium issues — " + inf + " informational " + (inf === 1 ? "note" : "notes") + " — no action needed";
    }
    level = "ok";
  } else if (high > 0) {
    headline = high === 1 ? "Needs attention" : "Needs attention";
    sublabel = high + " high-severity " + (high === 1 ? "issue" : "issues") + (med ? " · " + med + " warnings" : "");
    level = "critical";
  } else {
    headline = "Needs attention";
    sublabel = med + " " + (med === 1 ? "issue needs" : "issues need") + " attention";
    level = "warn";
  }
  return { headline, sublabel, level, high, med, inf };
}

function renderStatus(data) {
  const { findings = [], system = {} } = data;
  const ver = (data.version || "").replace(/^v/, "");
  $(".sysinfo").innerHTML =
    [system.distro, system.kernel, (system.cores || "?") + " core(s)", "up " + system.uptime].filter(Boolean).join(" · ") +
    (ver ? ' · <span class="ver">v' + ver + "</span>" : "");

  const high = findings.filter((f) => f.severity === "high").length;
  const med = findings.filter((f) => f.severity === "medium").length;
  const inf = findings.filter((f) => f.severity === "info").length;

  const { headline, sublabel, level } = renderStatusMessage(findings);

  const scoreDelta = typeof data.scoreDelta === "number" ? data.scoreDelta : null;
  const deltaCls = scoreDelta === null ? "" : scoreDelta > 0 ? "delta-up" : scoreDelta < 0 ? "delta-down" : "delta-flat";
  const deltaIcon = scoreDelta === null ? "" : scoreDelta > 0 ? "↗" : scoreDelta < 0 ? "↘" : "→";
  const deltaTxt = scoreDelta === null ? "no baseline yet" : (scoreDelta > 0 ? "+" + scoreDelta : String(scoreDelta)) + " since last check";
  const score = typeof data.score === "number" ? data.score : 0;

  // Build breakdown: human language, distinguish issues vs findings
  let breakdownHtml = "";
  if (high + med > 0) {
    const parts = [];
    if (high) parts.push("<b>" + high + "</b> high-severity " + (high === 1 ? "issue" : "issues"));
    if (med) parts.push("<b>" + med + "</b> medium " + (med === 1 ? "finding" : "findings"));
    breakdownHtml = '<div class="status-breakdown">' + parts.join('<span class="sep">·</span>') + '</div>';
    if (inf) breakdownHtml += '<div class="status-breakdown" style="margin-top:2px;color:var(--muted2)">' + inf + " informational " + (inf === 1 ? "note" : "notes") + " — no action needed</div>";
  } else if (inf) {
    breakdownHtml = '<div class="status-breakdown">' + inf + " informational " + (inf === 1 ? "finding" : "findings") + "</div>";
  }

  const chips =
    (data.newCount > 0 ? '<span class="newbadge">NEW ' + data.newCount + "</span>" : "") +
    (data.fixedCount > 0 ? '<span class="fixedbadge">FIXED ' + data.fixedCount + "</span>" : "");

  const status = $("#status");
  status.className = "status" + (high + med === 0 ? " calm" : high > 0 ? " warn" : "");

  // Hierarchy: [Gauge] score + delta / headline / one detail line / chips
  // One message line only: the breakdown when there is something to act on,
  // the plain-language sublabel when healthy (it carries the "no high or
  // medium issues" phrasing pinned by output-parity). The eyebrow and the
  // big "/100" duplicated the headline and the gauge, so they are gone.
  const detailHtml = (high + med > 0)
    ? breakdownHtml.replace('status-breakdown', 'status-breakdown" style="font-size:12px;margin-top:6px').replace('margin-top:2px;color:var(--muted2)', 'margin-top:2px;color:var(--muted2);font-size:11px')
    : '<div style="font-size:12px;color:var(--muted);margin-top:1px">' + sublabel + '</div>';

  status.innerHTML =
    '<div class="status-main">' +
    renderGauge(score, 84) +
    '</div>' +
    '<div class="status-body" style="gap:4px">' +
    '<div class="status-score-row" style="align-items:baseline;gap:10px;margin-top:2px">' +
      '<div style="font-size:42px;font-weight:800;letter-spacing:-0.03em;line-height:1;font-variant-numeric:tabular-nums" title="Health score ' + score + ' of 100">' + score + '</div>' +
      '<div class="scoredelta ' + deltaCls + '" style="font-size:11px;padding:3px 8px">' + deltaIcon + " " + deltaTxt + "</div>" +
    '</div>' +
    '<div class="status-headline ' + (level === "ok" ? "ok" : "warn") + '" style="font-size:13px;margin-top:6px;font-weight:650">' + headline + '</div>' +
    detailHtml +
    '<div class="status-meta">' + chips +
    '<span id="hero-spark" class="chip-trend" hidden></span>' +
    '<button id="checkschip" type="button" class="lowbadge" hidden></button>' +
    "</div>" +
    "</div>" +
    '<div class="stat-tiles">' +
      '<div class="stat-tile"><b style="color:' + (high > 0 ? "var(--red)" : med > 0 ? "var(--yellow)" : "var(--green)") + '">' + (high + med) + "</b><span>problems</span></div>" +
      '<div class="stat-tile"><b>' + (data.checksRun != null ? data.checksRun : "—") + "</b><span>checks" + (data.checksSkipped ? " · " + data.checksSkipped + " skipped" : "") + "</span></div>" +
      '<div class="stat-tile"><b>' + (typeof data.cleanStreak === "number" && data.cleanStreak > 0 ? data.cleanStreak + "×" : "—") + "</b><span>clean streak</span></div>" +
      '<div class="stat-tile"><b><span class="dot" id="statusdot"></span> <span id="statuspill-txt"></span></b><span>last check</span></div>' +
    "</div>";

  animateScore(score);
  return { high, medium: med, info: inf, score };
}
