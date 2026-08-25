/* === Status zone: gauge, score, status message === */
const SCORE_RING_R = 25;
const SCORE_RING_C = 2 * Math.PI * SCORE_RING_R;

function renderGauge(score) {
  const scoreColor = score >= 80 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)";
  return '<div class="gauge">' +
    '<svg viewBox="0 0 62 62" role="img" aria-label="Health score ' + score + ' of 100">' +
    '<circle class="track" cx="31" cy="31" r="' + SCORE_RING_R + '"></circle>' +
    '<circle class="ring" id="scorering" cx="31" cy="31" r="' + SCORE_RING_R + '" ' +
    'transform="rotate(-90 31 31)" stroke="' + scoreColor + '" ' +
    'stroke-dasharray="' + SCORE_RING_C + '" stroke-dashoffset="' + SCORE_RING_C + '"></circle>' +
    '</svg>' +
    '<div class="gauge-center"><div class="scorenum" id="scorenum">0</div><div class="scoreout">/ 100</div></div>' +
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
  let msgCls, msgTxt;
  if (high + med === 0) {
    msgCls = "ok";
    msgTxt = findings.length === 0
      ? "Nothing needs your attention."
      : "No high or medium issues \u2014 informational notes below.";
  } else {
    const parts = [];
    if (high) parts.push(high + " high-severity " + (high === 1 ? "issue" : "issues"));
    if (med) parts.push(med + " medium-severity " + (med === 1 ? "issue" : "issues"));
    msgCls = "warn";
    msgTxt = parts.join(" and ") + " need attention \u2014 see below.";
  }
  return { msgCls, msgTxt };
}

function renderStatus(data) {
  const { findings = [], system = {} } = data;
  const ver = (data.version || "").replace(/^v/, "");
  $(".sysinfo").innerHTML =
    [system.distro, system.kernel, (system.cores || "?") + " core(s)", "up " + system.uptime].filter(Boolean).join(" \u00b7 ") +
    (ver ? ' \u00b7 <span class="ver">v' + ver + "</span>" : "");

  const high = findings.filter((f) => f.severity === "high").length;
  const med = findings.filter((f) => f.severity === "medium").length;
  const inf = findings.filter((f) => f.severity === "info").length;

  const { msgCls, msgTxt } = renderStatusMessage(findings);

  const scoreDelta = typeof data.scoreDelta === "number" ? data.scoreDelta : null;
  const deltaCls = scoreDelta === null ? "" : scoreDelta > 0 ? "delta-up" : scoreDelta < 0 ? "delta-down" : "delta-flat";
  const deltaTxt = scoreDelta === null ? "no baseline yet" : scoreDelta > 0 ? "\u25b2 +" + scoreDelta : scoreDelta < 0 ? "\u25bc " + scoreDelta : "unchanged";
  const score = typeof data.score === "number" ? data.score : 0;

  const chips =
    (data.newCount > 0 ? '<span class="newbadge">NEW ' + data.newCount + "</span>" : "") +
    (data.fixedCount > 0 ? '<span class="fixedbadge">FIXED ' + data.fixedCount + "</span>" : "");

  const status = $("#status");
  status.className = "status" + (high + med === 0 ? " calm" : "");
  status.innerHTML =
    '<div class="status-main">' +
    renderGauge(score) +
    '<div class="hero-main"><div class="k">Health</div>' +
    '<div class="scoredelta ' + deltaCls + '">' + deltaTxt + '</div></div>' +
    '</div>' +
    '<div class="status-body">' +
    '<div class="statusmsg ' + msgCls + '">' + msgTxt + "</div>" +
    '<div class="status-meta"><span class="dot" id="statusdot"></span><span id="statuspill-txt"></span>' + chips +
    '<span id="hero-spark" class="chip-trend" hidden></span>' +
    '<span id="checkschip" class="lowbadge" hidden></span>' +
    "</div>" +
    "</div>";

  animateScore(score);
  return { high, medium: med, info: inf, score };
}
