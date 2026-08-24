/* === Finding cards and groups === */
function renderCard(f, sev) {
  const sevIcon = SEV_ICONS[sev] || "";
  const badges =
    (f.isNew ? '<span class="newbadge" title="Appeared since your last check">NEW</span>' : "") +
    (f.confidence === "low" ? '<span class="lowbadge" title="This finding may be a false positive">LOW CONF</span>' : "") +
    (f.check ? '<span class="checkid">' + esc(f.check) + "</span>" : "");

  const SEV_COST = { high: "costs 15 points (+5 each extra)", medium: "costs 8 points (+1 past the third)", info: "informational — free" };
  let html = '<details class="card ' + SEV[sev].cls + '" tabindex="0" data-code="' + esc(f.code || "") + '"' +
    (f.check ? ' data-check="' + esc(f.check) + '"' : "") + ">";
  html += '<summary><span class="sevicon" aria-hidden="true" title="' + esc(SEV_NAMES[sev] + " \u2014 " + (SEV_COST[sev] || "")) + '">' + sevIcon + '</span><h3>' + esc(f.title) + '</h3>' + badges + '<span class="chev" aria-hidden="true">\u25b8</span></summary>';
  html += '<div class="card-body">';

  if (f.detail) html += '<div class="detail">' + esc(f.detail) + "</div>";

  if (f.evidence) {
    const evId = "ev-" + (f.id || f.code || Math.random().toString(36).slice(2));
    html += '<details class="ev"><summary>Evidence</summary>' +
      '<div class="evidence" id="' + evId + '">' + esc(f.evidence) + '</div>' +
      '<div style="display:flex; gap:6px; margin:6px 12px 10px; flex-wrap:wrap;">' +
      '<button class="ev-expand" data-ev="' + evId + '" hidden>Show more</button>' +
      '<button class="ev-copy" data-evcopy="' + evId + '">\u22b1 Copy evidence</button></div></details>';
  }

  html += '<div class="fix">';
  if (f.fix) html += '<div class="fixtext">' + esc(f.fix) + '</div>';
  html += '<button data-copy="' + esc(f.fix || f.detail || f.title) + '">Copy</button>';
  html += '<button data-ignore="' + esc(f.title) + '" title="Never report this finding again (saved to ~/.config/linux-doctor/config.json)">Ignore</button>';
  html += '<a class="reportbtn" href="' + wrongUrl(f) + '" target="_blank" rel="noopener" title="This finding looks wrong? Open a GitHub issue pre-filled with the details">Report wrong</a>';
  html += '</div>';

  html += "</div></details>";
  return html;
}

function groupSummaryHtml(icon, label, count) {
  return '<summary><span class="sevicon" aria-hidden="true">' + icon + '</span> ' + esc(label) + " <b>" + count + '</b><span class="chev" aria-hidden="true">\u25b8</span></summary>';
}

function wrapGroup(cls, type, key, summaryInner, cardsHtml, open) {
  return '<details class="group ' + cls + '"' + (open ? " open" : "") +
    ' data-type="' + type + '" data-key="' + esc(key) + '">' +
    summaryInner + '<div class="group-body">' + cardsHtml + "</div></details>";
}

/* Severity mode: one group per severity tier, high first, high pre-opened. */
function renderReportBySeverity(findings) {
  let html = "";
  for (const sev of SEV_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    const cards = group.map((f) => renderCard(f, sev)).join("");
    html += wrapGroup(SEV[sev].cls, "sev", sev,
      groupSummaryHtml(SEV_ICONS[sev] || "", SEV_NAMES[sev], group.length), cards, sev === "high");
  }
  return html;
}

/* Category mode: one neutral group per check category; severity stays
   visible on each card's colored edge and icon. Unknown checks → Other. */
function renderReportByCategory(findings) {
  const buckets = new Map();
  for (const f of findings) {
    const cat = checksCategoryMap.get(f.check) || "other";
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat).push(f);
  }
  let html = "";
  for (const cat of CATEGORY_ORDER) {
    const group = buckets.get(cat);
    if (!group || !group.length) continue;
    // Within a category: highest severity first so the top card is the headline.
    group.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
    const cards = group.map((f) => renderCard(f, f.severity)).join("");
    html += wrapGroup("", "cat", cat,
      groupSummaryHtml("\u25a3", CATEGORY_LABELS[cat] || cat, group.length), cards, false);
  }
  return html;
}

function renderReport(findings) {
  const html = groupBy === "category"
    ? renderReportByCategory(findings)
    : renderReportBySeverity(findings);
  return html || "";
}

function categoryOf(f) {
  return checksCategoryMap.get(f.check) || "other";
}

function wrongUrl(f) {
  return "https://github.com/zShaD0w7x/linux-doctor/issues/new?" +
    "title=" + encodeURIComponent("Wrong finding: " + (f.code || f.title)) +
    "&body=" + encodeURIComponent(
      "**Finding:** " + (f.title || "") + "\n" +
      "**Severity:** " + (f.severity || "") + "\n" +
      "**Check:** " + (f.check || "") + "\n" +
      "**Code:** " + (f.code || "") + "\n" +
      "**Version:** " + (typeof lastReportData !== "undefined" && lastReportData ? lastReportData.version || "" : "") + "\n\n" +
      "This finding looks wrong because:\n\n[describe what you expected]\n\n---\n" +
      "Full report: `linux-doctor --json`");
}
