/* === All-checks matrix ===
   A diagnostic tool earns trust by showing what it looked AT, not only
   what it found. This modal lists every registered check with its live
   outcome on this machine: findings (worst severity first), clean,
   not-applicable for this profile, atomic skips, or runtime errors.
   Rows with findings deep-link back to their cards in the report. */

function checksMatrixHtml(data, checks) {
  const findingsByCheck = new Map();
  for (const f of data.findings || []) {
    if (!findingsByCheck.has(f.check)) findingsByCheck.set(f.check, []);
    findingsByCheck.get(f.check).push(f);
  }
  const errors = new Map((data.checkErrors || []).map((e) => [e.check, e.error]));
  const atomic = new Set((data.skippedChecks || []).map((s) => s.id));

  const SEV_RANK = { high: 0, medium: 1, info: 2 };
  const SEV_DOT_COLOR = { high: "#ff6b74", medium: "#ffce5a", info: "#74acff" };
  const dot = (c) => '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="' + c + '"/></svg>';
  const ST = {
    err:    '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#ff6b74"/><path d="M4.2 4.2l3.6 3.6M7.8 4.2L4.2 7.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    ok:     '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#3ee29a"/><path d="M3.8 6.2l1.5 1.5L8.4 4.4" stroke="#0b241a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    na:     '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="#8a93a6" stroke-width="1.6"/><path d="M4 6h4" stroke="#8a93a6" stroke-width="1.6" stroke-linecap="round"/></svg>',
    atomic: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#c08bff"/><path d="M4.8 4v4M7.2 4v4" stroke="#241333" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };
  function statusOf(c) {
    if (errors.has(c.id)) return { rank: 0, icon: ST.err, cls: "err", note: esc(errors.get(c.id) || "failed to run") };
    const fs = findingsByCheck.get(c.id) || [];
    if (fs.length) {
      fs.sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
      return { rank: 1, icon: dot(SEV_DOT_COLOR[fs[0].severity]), cls: fs[0].severity, note: fs.length + " finding" + (fs.length > 1 ? "s" : ""), goto: true };
    }
    if (!c.appliesHere) return { rank: 3, icon: ST.na, cls: "na", note: "runs on: " + (c.appliesTo || []).join(", ") };
    if (c.skipOnAtomic || atomic.has(c.id)) return { rank: 3, icon: ST.atomic, cls: "na", note: c.atomicReason || "skipped on immutable/atomic systems" };
    return { rank: 2, icon: ST.ok, cls: "ok", note: "clean" };
  }

  const cats = new Map();
  for (const c of checks) {
    const cat = c.category || "other";
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat).push(c);
  }

  let problemCount = 0, errorCount = 0, cleanCount = 0, naCount = 0;
  let body = "";
  for (const cat of CATEGORY_ORDER) {
    const list = cats.get(cat);
    if (!list || !list.length) continue;
    const rows = list.map((c) => ({ c, s: statusOf(c) }))
      .sort((a, b) => a.s.rank - b.s.rank || a.c.id.localeCompare(b.c.id));
    body += '<div class="mx-cat">' + catIcon(cat, 12) + " " + esc(CATEGORY_LABELS[cat] || cat) + "</div>";
    for (const { c, s } of rows) {
      if (s.rank === 1) problemCount++;
      else if (s.rank === 0) errorCount++;
      else if (s.rank === 2) cleanCount++;
      else naCount++;
      const gotoAttr = s.goto
        ? ' data-goto-code="' + esc(((findingsByCheck.get(c.id) || [])[0] || {}).code || "") + '" data-goto-check="' + esc(c.id) + '"'
        : "";
      body += '<div class="mx-row' + (s.goto ? " link" : "") + '"' + gotoAttr + ">" +
        '<span class="mx-st" aria-hidden="true">' + s.icon + '</span>' +
        '<span class="mx-id">' + esc(c.id) + '</span>' +
        '<span class="mx-title">' + esc(c.title) + '</span>' +
        '<span class="mx-note ' + s.cls + '">' + s.note + "</span></div>";
    }
  }

  const total = checks.length;
  return '<div class="mx-head">All checks</div>' +
    '<div class="mx-sub">' + total + " registered \u00b7 " +
    problemCount + " with findings \u00b7 " +
    cleanCount + " clean \u00b7 " +
    (errorCount ? errorCount + " failed to run \u00b7 " : "") +
    naCount + " not applicable here" +
    (STATIC_DATA ? " \u00b7 static report: live check list unavailable" : "") + "</div>" +
    body;
}

async function openChecksMatrix() {
  openModal('<div class="mx-head">All checks</div><div class="mx-sub">Loading\u2026</div>');
  const checks = STATIC_DATA ? [] : await fetchChecks();
  openModal(checksMatrixHtml(lastReportData || {}, checks));

  // Deep-link rows: close the modal and reveal the finding card.
  $("#modal-body").addEventListener("click", (e) => {
    const row = e.target.closest("[data-goto-check]");
    if (!row) return;
    closeModal();
    activeFilter = "all";
    document.querySelectorAll(".fpill").forEach((b) => b.classList.toggle("active", b.dataset.sev === "all"));
    syncGroupsOpen();
    applyFilters();
    const code = row.dataset.gotoCode;
    const card = (code && document.querySelector('#report details[data-code="' + code.replace(/"/g, '\\"') + '"]'))
      || document.querySelector('#report details[data-check="' + row.dataset.gotoCheck.replace(/"/g, '\\"') + '"]');
    if (card) {
      card.setAttribute("open", "");
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Showing " + row.dataset.gotoCheck);
    }
  }, { once: true });
}

function setupChecksMatrix() {
  $("#checksmatrixbtn")?.addEventListener("click", openChecksMatrix);
}
