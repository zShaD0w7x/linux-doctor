/* === History section + chart interaction === */
let statusTimer = null;

function setStatus(generatedAt) {
  const txt = $("#statuspill-txt");
  const dot = $("#statusdot");
  if (!txt || !dot) return;
  const ms = Date.now() - new Date(generatedAt).getTime();
  const secs = Math.max(0, Math.round(ms / 1000));
  let label;
  if (secs < 5) label = "checked just now";
  else if (secs < 60) label = "checked " + secs + "s ago";
  else if (secs < 3600) label = "checked " + Math.floor(secs / 60) + "m ago";
  else if (secs < 86400) label = "checked " + Math.floor(secs / 3600) + "h ago";
  else label = "checked " + Math.floor(secs / 86400) + "d ago";
  txt.textContent = label;
  dot.className = "dot" + (secs >= 3600 ? " stale" : "");
}

async function renderTrend(currentScore) {
  if (STATIC_DATA) return;
  const trend = $("#trend");
  const runs = await fetchHistory();
  const data = runs.filter((r) => typeof r.score === "number").slice(-12);
  $("#history").hidden = data.length < 2;
  if ($("#history").hidden) return;

  // Hero mini-sparkline: the score's recent direction, visible at a glance.
  const spark = $("#hero-spark");
  if (spark) {
    spark.innerHTML = miniSpark(data);
    spark.hidden = false;
  }

  trend.innerHTML = '<div class="trend-wrap">' + scoreChart(data) + severityChart(data) + '</div>';

  if (typeof currentScore === "number" && currentScore < 80) {
    const det = document.querySelector(".hist-details");
    if (det) det.open = true;
  }

  setTimeout(() => {
    const histData = data;
    const showRun = (idx) => {
      const r = histData[idx];
      if (!r) return;
      const prev = idx > 0 ? histData[idx - 1] : null;
      let msg = "Run " + (idx + 1) + "/" + histData.length + " \u00b7 " + fmtWhen(r.at) + " \u00b7 score " + r.score + "/100";
      if (prev) msg += " (prev " + prev.score + ")";
      showToast(msg + " \u2014 opening Changes");
      const diffEl = $("#diff");
      if (diffEl) { diffEl.hidden = false; diffEl.open = true; diffEl.scrollIntoView({ behavior: "smooth", block: "start" }); }
      const det = document.querySelector(".hist-details");
      if (det) det.open = true;
    };
    trend.querySelectorAll(".hist-dot, .hist-bar").forEach(el => {
      el.addEventListener("click", () => { const idx = Number(el.dataset.idx || el.closest("[data-idx]")?.dataset.idx); if (Number.isFinite(idx)) showRun(idx); });
    });
  }, 80);
}
