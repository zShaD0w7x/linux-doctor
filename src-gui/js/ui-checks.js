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
  function statusOf(c) {
    if (errors.has(c.id)) return { rank: 0, icon: "\u26a0\ufe0f", cls: "err", note: esc(errors.get(c.id) || "failed to run") };
    const fs = findingsByCheck.get(c.id) || [];
    if (fs.length) {
      fs.sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
      return { rank: 1, icon: SEV_ICONS[fs[0].severity] || "\u25cf", cls: fs[0].severity, note: fs.length + " finding" + (fs.length > 1 ? "s" : ""), goto: true };
    }
    if (!c.appliesHere) return { rank: 3, icon: "\u2013", cls: "na", note: "runs on: " + (c.appliesTo || []).join(", ") };
    if (c.skipOnAtomic || atomic.has(c.id)) return { rank: 3, icon: "\u23ed", cls: "na", note: c.atomicReason || "skipped on immutable/atomic systems" };
    return { rank: 2, icon: "\u2705", cls: "ok", note: "clean" };
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
    body += '<div class="mx-cat">' + esc(CATEGORY_LABELS[cat] || cat) + "</div>";
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
