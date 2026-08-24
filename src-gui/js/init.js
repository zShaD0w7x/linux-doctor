/* === Entry point: load, bind, start === */

// Theme
applyTheme();
$("#theme").addEventListener("click", cycleTheme);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

// Sticky header/toolbar
const hdr = document.querySelector("header");
const tbar = document.querySelector(".toolbar");
window.addEventListener("scroll", () => {
  const sc = window.scrollY > 8;
  if (hdr) hdr.classList.toggle("scrolled", sc);
  if (tbar) tbar.classList.toggle("scrolled", sc);
}, { passive: true });

// Filters
$("#filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".fpill");
  if (!btn) return;
  activeFilter = activeFilter === btn.dataset.sev ? null : btn.dataset.sev;
  document.querySelectorAll(".fpill").forEach((b) => b.classList.toggle("active", b.dataset.sev === activeFilter));
  syncGroupsOpen();
  applyFilters();
});
$("#search").addEventListener("input", applyFilters);
$("#clearbtn").addEventListener("click", () => {
  activeFilter = "all";
  $("#search").value = "";
  document.querySelectorAll(".fpill").forEach((b) => b.classList.toggle("active", b.dataset.sev === activeFilter));
  syncGroupsOpen();
  applyFilters();
});

// Expand all
$("#expandall").addEventListener("click", () => {
  const anyClosed = [...document.querySelectorAll("#report .group, #report .card, #report .crow")].some((el) => !el.open);
  setAllOpen(anyClosed);
  syncAutoPausedUI();
});

// Re-run
async function load() {
  const status = $("#status");
  const report = $("#report");
  const rerun = $("#rerun");
  status.className = "status running";
  status.innerHTML = '<span class="spinner" aria-hidden="true"></span>Reading your system\u2026';
  $("#expandall").textContent = "\u229e Expand all";
  report.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  rerun.disabled = true;
  rerun.textContent = "\u221b Running\u2026";
  try {
    // Category grouping needs the check→category map; fetch it once before
    // the first render. Never fatal — grouping falls back to "Other".
    await loadCategoryMap();
    render(await fetchReport());
  } catch (err) {
    status.className = "status warn";
    status.innerHTML = "";
    status.textContent = "\u26a0\ufe0f Could not run checks: " + (err && err.message ? err.message : err);
    report.innerHTML = '<div class="empty">Run failed \u2014 see the message above. Make sure Node.js \u2265 20 is installed and on PATH.</div>';
  } finally {
    rerun.disabled = false;
    rerun.textContent = "\u221b Re-run checks";
  }
}
$("#rerun").addEventListener("click", load);

// PDF export
const pdfBtn = $("#pdfbtn");
if (pdfBtn) {
  pdfBtn.addEventListener("click", () => {
    document.querySelectorAll(".group, .card, .crow, details.ev").forEach(el => el.setAttribute("open", ""));
    setTimeout(() => window.print(), 120);
    showToast("\u{1f5a8}\ufe0f Print dialog opened \u2014 save as PDF");
  });
}

// Markdown export
$("#export").addEventListener("click", async () => {
  if (!lastData) return;
  await copyText(reportMarkdown(lastData));
  const btn = $("#export");
  const old = btn.textContent;
  btn.textContent = "\u2713 Copied";
  showToast("\u2713 Report copied as Markdown");
  setTimeout(() => (btn.textContent = old), 1200);
});

// Banner buttons: copy fix / jump to finding
document.addEventListener("click", async (e) => {
  // NH copy
  const copyBtn = e.target.closest("[data-nhcopy]");
  if (copyBtn) {
    await copyText(copyBtn.dataset.nhcopy);
    showToast("\u2713 Fix copied to clipboard");
    return;
  }
  // NH jump
  const jumpBtn = e.target.closest("[data-nhjump]");
  if (jumpBtn) {
    const code = jumpBtn.dataset.nhjump;
    activeFilter = "all";
    document.querySelectorAll(".fpill").forEach((b) => b.classList.toggle("active", b.dataset.sev === "all"));
    syncGroupsOpen();
    applyFilters();
    const card = code ? document.querySelector('#report details[data-code="' + code.replace(/"/g, '\\"') + '"]') : null;
    if (card) {
      card.setAttribute("open", "");
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { card.classList.remove("flash"); }, 50);
      const nh = $("#nexthep");
      if (nh) nh.classList.add("flash");
      setTimeout(() => nh && nh.classList.remove("flash"), 1700);
    }
    return;
  }
  // Evidence copy
  if (e.target.classList.contains("ev-copy")) {
    const id = e.target.dataset.evcopy;
    const ev = document.getElementById(id);
    if (ev) {
      await copyText(ev.textContent);
      const old = e.target.textContent;
      e.target.textContent = "\u2713 Copied";
      showToast("\u2713 Evidence copied");
      setTimeout(() => e.target.textContent = old, 1200);
    }
    return;
  }
  // Evidence expand
  if (e.target.classList.contains("ev-expand")) {
    const id = e.target.dataset.ev;
    const ev = document.getElementById(id);
    if (ev) {
      const expanded = ev.classList.toggle("expanded");
      e.target.textContent = expanded ? "Show less" : "Show more";
    }
    return;
  }
  // Generic copy
  if (e.target.dataset.copy !== undefined) {
    await copyText(e.target.dataset.copy);
    const old = e.target.textContent;
    e.target.textContent = "\u2713 Copied";
    showToast("\u2713 Copied to clipboard");
    setTimeout(() => (e.target.textContent = old), 1200);
  }
  // Ignore
  if (e.target.dataset.ignore !== undefined) {
    await ignoreFinding(e.target.dataset.ignore, e.target);
  }
  // Undo
  if (e.target.dataset.undo !== undefined) {
    if (lastUndo && lastData) {
      lastData.findings = [...lastUndo.findings];
      render(lastData);
      showToast("\u21a9 Restored");
      lastUndo = null;
    }
  }
});

// Ignore finding
let lastUndo = null;
async function ignoreFinding(title, btn) {
  const payload = JSON.stringify({ pattern: title });
  const tryPost = async (url) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    return res.ok;
  };
  let ok = false;
  try { ok = await tryPost("http://127.0.0.1:17321/api/ignore"); } catch { ok = false; }
  if (!ok) { try { ok = await tryPost("/api/ignore"); } catch { ok = false; } }
  btn.disabled = true;
  btn.textContent = ok ? "\u2713 Ignored" : "\u2717 Could not save";
  if (ok && lastData) {
    lastUndo = { findings: [...lastData.findings], title };
    lastData.findings = lastData.findings.filter((f) => f.title !== title);
    render(lastData);
    showToast('Ignored "' + esc(title).slice(0, 40) + (title.length > 40 ? "\u2026" : "") + '" <button data-undo>Undo</button>', 4000);
    setTimeout(() => { if (lastUndo && lastUndo.title === title) lastUndo = null; }, 4200);
  } else if (!ok) {
    showToast("\u2717 Could not save \u2014 check permissions");
  }
}

// Setup modules
setupKeyboard();
setupPolling();
setupThresholds();
setupNotifyButton();
setupSidebar();
setupModal();
setupChecksMatrix();

// JSON export — the same versioned envelope /api/report serves.
$("#copyjson")?.addEventListener("click", async () => {
  if (!lastData) return;
  await copyText(JSON.stringify(lastData, null, 2));
  showToast("\u2713 JSON report copied");
});

// Keyboard shortcuts help (?)
$("#helpbtn")?.addEventListener("click", openHelp);

// The hero "N checks" chip opens the matrix too.
$("#checkschip")?.addEventListener("click", openChecksMatrix);

// Density toggle: compact card spacing, remembered across sessions.
const densityBtn = $("#densitybtn");
if (densityBtn) {
  try { if (localStorage.getItem("ld-density") === "compact") document.body.classList.add("compact"); } catch {}
  const syncDensityBtn = () => {
    const compact = document.body.classList.contains("compact");
    densityBtn.setAttribute("aria-pressed", String(compact));
    densityBtn.title = compact ? "Density: compact — click for comfortable" : "Density: comfortable — click for compact";
  };
  syncDensityBtn();
  densityBtn.addEventListener("click", () => {
    const compact = document.body.classList.toggle("compact");
    try { localStorage.setItem("ld-density", compact ? "compact" : "comfortable"); } catch {}
    syncDensityBtn();
    showToast(compact ? "\u2261 Compact density" : "\u2637 Comfortable density");
  });
}

// Initial load
if (STATIC_DATA) {
  render(STATIC_DATA);
  const rerun = $("#rerun");
  if (rerun) { rerun.disabled = true; rerun.title = "Static report \u2014 regenerate with linux-doctor --html <path>"; }
} else {
  load();
  startPolling();
}
