/* === Threshold editor panel === */
let threshData = null;

async function loadThresh() {
  try {
    const r = await fetch("/api/thresholds", { cache: "no-store" });
    if (!r.ok) throw new Error("" + r.status);
    const j = await r.json();
    threshData = j.thresholds || j.defaults || {};
    const defs = j.defaults || {};
    const fields = [
      ["diskFullPct", "Disk full %", "90"], ["diskWarnPct", "Disk warn %", "80"],
      ["memLowRatio", "Mem low ratio", "0.15"], ["memWarnRatio", "Mem warn ratio", "0.25"],
      ["loadWarnRatio", "Load warn", "0.7"], ["loadHighRatio", "Load high", "1.0"], ["loadCriticalRatio", "Load crit", "1.5"],
      ["tempWarnC", "Temp warn \u00b0C", "85"], ["tempHotC", "Temp hot \u00b0C", "95"],
      ["procWarnRatio", "Proc warn", "0.2"], ["procHighRatio", "Proc high", "0.4"],
      ["journalWarnBytes", "Journal bytes", "2147483648"], ["containerWarnGB", "Cont. warn GB", "20"], ["containerHighGB", "Cont. high GB", "50"],
      ["dnsSlowMs", "DNS slow ms", "500"],
    ];
    $("#threshbody").innerHTML = fields.map(([k, label, def]) => {
      const v = threshData[k] ?? defs[k] ?? def;
      return '<div class="thresh-field"><label for="th-' + k + '">' + label + ' <span style="font-weight:400; text-transform:none; letter-spacing:0;">(' + k + ')</span></label><input id="th-' + k + '" data-k="' + k + '" type="number" step="any" value="' + esc(v) + '"></div>';
    }).join("");
    if (!threshData || Object.keys(threshData).length === 0) {
      try {
        const r2 = await fetch("http://127.0.0.1:17321/thresholds", { cache: "no-store" });
        if (r2.ok) { const j2 = await r2.json(); if (j2.thresholds) threshData = j2.thresholds; }
      } catch {}
    }
  } catch (e) { $("#threshbody").innerHTML = '<div style="color:var(--muted);font-size:12px;">Could not load thresholds: ' + esc(e.message) + '</div>'; }
}

function setupThresholds() {
  const threshBtn = $("#threshbtn");
  const threshPanel = $("#threshpanel");
  const threshBody = $("#threshbody");
  const threshMsg = $("#threshmsg");
  if (!threshBtn || !threshPanel) return;

  threshBtn.addEventListener("click", async () => {
    const hidden = threshPanel.hidden;
    threshPanel.hidden = !hidden;
    if (!hidden) return;
    await loadThresh();
  });

  $("#threshclose")?.addEventListener("click", () => threshPanel.hidden = true);

  $("#threshcopy")?.addEventListener("click", async () => {
    const data = {};
    threshBody.querySelectorAll("input[data-k]").forEach(inp => { const k = inp.dataset.k; const v = Number(inp.value); if (Number.isFinite(v)) data[k] = v; });
    await copyText(JSON.stringify({ thresholds: data }, null, 2));
    threshMsg.textContent = "\u2713 Copied JSON";
    showToast("\u2713 Thresholds JSON copied \u2014 paste into ~/.config/linux-doctor/config.json");
    setTimeout(() => threshMsg.textContent = "", 1500);
  });

  $("#threshsave")?.addEventListener("click", async () => {
    const data = {};
    threshBody.querySelectorAll("input[data-k]").forEach(inp => { const k = inp.dataset.k; const v = Number(inp.value); if (Number.isFinite(v)) data[k] = v; });
    threshMsg.textContent = "Saving\u2026";
    let ok = false;
    try { const r = await fetch("/api/thresholds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thresholds: data }) }); ok = r.ok; } catch {}
    if (!ok) { try { const r2 = await fetch("http://127.0.0.1:17321/thresholds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thresholds: data }) }); ok = r2.ok; } catch {} }
    threshMsg.textContent = ok ? "\u2713 Saved \u2014 re-run checks to apply" : "\u2717 Save failed";
    showToast(ok ? "\u2713 Thresholds saved" : "\u2717 Could not save thresholds");
    if (ok) setTimeout(() => threshPanel.hidden = true, 900);
  });
}
