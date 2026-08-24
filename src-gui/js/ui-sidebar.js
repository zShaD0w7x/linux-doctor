/* === Overview sidebar: score breakdown bars + severity/category nav === */

function renderSidebar(data, counts) {
  const sidebar = $("#sidebar");
  if (!sidebar) return;
  const findings = data.findings || [];
  sidebar.hidden = false;

  renderBreakdownBars(data);
  renderSeverityNav(counts);
  renderCategoryNav(findings);
}

/* "Why this score": top penalized findings as proportional bars.
   Mirrors the CLI's SCORE line (top-3 + "+N more") using the same
   server-computed scoreBreakdown — never re-derived here. */
function renderBreakdownBars(data) {
  const el = $("#sb-breakdown");
  if (!el) return;
  const rows = (data.scoreBreakdown || []).filter((b) => b.penalty > 0)
    .sort((a, b) => b.penalty - a.penalty);
  if (!rows.length) {
    el.innerHTML = '<div class="bd-clean">\u2713 No score penalties</div>';
    return;
  }
  const TOP = 3;
  const max = rows[0].penalty;
  const shown = rows.slice(0, TOP);
  el.innerHTML = shown.map((b) => {
    const pct = Math.max(6, Math.round((b.penalty / max) * 100));
    return '<div class="bd-row">' +
      '<div class="bd-top"><span class="bd-title" title="' + esc(b.title || b.code || "") + '">' +
      esc(b.title || b.code || "") + '</span>' +
      '<span class="bd-pen ' + esc(b.severity) + '" title="' + esc(SEV_NAMES[b.severity] || b.severity) + " \u2014 this finding removed " + b.penalty + " points from 100\">" +
      "\u2212" + b.penalty + "</span></div>" +
      '<div class="bd-code">' + esc(b.code || "") + '</div>' +
      '<div class="bd-bar"><div class="bd-fill ' + esc(b.severity) + '" style="width:' + pct + '%"></div></div>' +
      "</div>";
  }).join("") +
    (rows.length > TOP ? '<div class="bd-more">+' + (rows.length - TOP) + " more</div>" : "");
}

function renderSeverityNav(counts) {
  const el = $("#sb-sevnav");
  if (!el) return;
  el.innerHTML = SEV_ORDER.map((sev) => {
    const n = counts[sev] || 0;
    if (!n) return "";
    return '<button class="sb-item ' + sev + (activeFilter === sev ? " active" : "") + '" data-nav-sev="' + sev + '">' +
      '<span class="sevicon" data-sev="' + sev + '" aria-hidden="true">' + (SEV_ICONS[sev] || "") + '</span>' +
      '<span class="sb-label">' + SEV_NAMES[sev] + '</span>' +
      '<span class="sb-count">' + n + "</span></button>";
  }).join("") || '<div class="bd-clean" style="font-size:11.5px;">Nothing needs attention</div>';
}

function renderCategoryNav(findings) {
  const el = $("#sb-catnav");
  if (!el) return;
  const tally = new Map();
  for (const f of findings) {
    const cat = categoryOf(f);
    tally.set(cat, (tally.get(cat) || 0) + 1);
  }
  el.innerHTML = CATEGORY_ORDER.map((cat) => {
    const n = tally.get(cat) || 0;
    if (!n) return "";
    return '<button class="sb-item" data-nav-cat="' + cat + '">' +
      '<span class="sb-label">' + esc(CATEGORY_LABELS[cat] || cat) + '</span>' +
      '<span class="sb-count">' + n + "</span></button>";
  }).join("");
}

/* Switch grouping mode and re-render the current report in place.
   The choice persists across sessions. */
function setGroupBy(mode) {
  if (mode !== "severity" && mode !== "category") return;
  try { localStorage.setItem("ld-groupby", mode); } catch {}
  if (groupBy === mode) return;
  groupBy = mode;
  document.querySelectorAll(".segbtn").forEach((b) =>
    b.classList.toggle("active", b.dataset.groupby === mode));
  if (lastData) render(lastData);
}

function setupSidebar() {
  // Restore the grouping chosen in a previous session, before the first
  // render paints the wrong mode and has to flip.
  try {
    const saved = localStorage.getItem("ld-groupby");
    if (saved === "severity" || saved === "category") {
      groupBy = saved;
      document.querySelectorAll(".segbtn").forEach((b) =>
        b.classList.toggle("active", b.dataset.groupby === saved));
    }
  } catch {}

  document.addEventListener("click", (e) => {
    // Segmented control
    const seg = e.target.closest(".segbtn");
    if (seg) { setGroupBy(seg.dataset.groupby); return; }

    // Sidebar severity row → severity view + that filter
    const sevBtn = e.target.closest("[data-nav-sev]");
    if (sevBtn) {
      setGroupBy("severity");
      activeFilter = sevBtn.dataset.navSev;
      document.querySelectorAll(".fpill").forEach((b) => b.classList.toggle("active", b.dataset.sev === activeFilter));
      syncGroupsOpen();
      applyFilters();
      scrollToGroup("sev", activeFilter);
      return;
    }

    // Sidebar category row → category view + open that group
    const catBtn = e.target.closest("[data-nav-cat]");
    if (catBtn) {
      setGroupBy("category");
      requestAnimationFrame(() => scrollToGroup("cat", catBtn.dataset.navCat));
    }
  });
}

function scrollToGroup(type, key) {
  const g = document.querySelector('#report .group[data-type="' + type + '"][data-key="' + key.replace(/"/g, '\\"') + '"]');
  if (!g) return;
  g.setAttribute("open", "");
  g.scrollIntoView({ behavior: "smooth", block: "start" });
}
