/* === Severity filters + search === */
let activeFilter = "all";

const PILL_ICONS = { all: "\u25c9", high: "\u{1f534}", medium: "\u{1f7e1}", info: "\u{1f535}" };

function renderFilters(counts) {
  const total = counts.high + counts.medium + counts.info;
  const defs = [
    { sev: "all", label: "All" + (total ? " (" + total + ")" : ""), icon: PILL_ICONS.all },
    { sev: "high", label: "High" + (counts.high ? " (" + counts.high + ")" : ""), icon: PILL_ICONS.high },
    { sev: "medium", label: "Medium" + (counts.medium ? " (" + counts.medium + ")" : ""), icon: PILL_ICONS.medium },
    { sev: "info", label: "Info" + (counts.info ? " (" + counts.info + ")" : ""), icon: PILL_ICONS.info },
  ];
  const empty = (sev) => sev !== "all" && (counts[sev] || 0) === 0;
  if (empty(activeFilter)) activeFilter = "all";
  $("#filters").innerHTML = defs.map((d) =>
    '<button class="fpill ' + d.sev + (activeFilter === d.sev ? " active" : "") + '" data-sev="' + d.sev + '"' +
    (empty(d.sev) ? " disabled" : "") + '><span class="pill-icon" aria-hidden="true">' + d.icon + '</span> ' + d.label + '</button>'
  ).join("");
  syncClear();
}

function applyFilters() {
  const report = $("#report");
  const hint = $("#drillhint");
  report.hidden = !activeFilter;
  hint.hidden = !!activeFilter;
  if (activeFilter) {
    hint.textContent = "";
  } else {
    hint.textContent = groupBy === "category"
      ? "Select a category to see findings."
      : "Select a severity to see findings.";
  }
  const qRaw = $("#search").value.trim();
  const q = qRaw.toLowerCase();
  let visible = 0;
  document.querySelectorAll("#report .group").forEach((g) => {
    // Severity gate at card level so it also works inside category groups
    // (a category bucket mixes severities; the group itself has none).
    let any = false;
    g.querySelectorAll(".card, .crow").forEach((c) => {
      const sevOk = activeFilter === "all" || c.classList.contains(activeFilter);
      const match = sevOk && (!q || c.textContent.toLowerCase().includes(q));
      c.style.display = match ? "" : "none";
      if (match) {
        any = true;
        highlightMatches(c, qRaw);
      } else {
        highlightMatches(c, "");
      }
    });
    if (!qRaw) g.querySelectorAll(".card, .crow").forEach(c => highlightMatches(c, ""));
    g.hidden = !any;
    if (any) visible++;
  });
  const nomatch = $("#nomatch");
  nomatch.hidden = !(activeFilter && qRaw && visible === 0);
  if (!nomatch.hidden) nomatch.textContent = 'No findings match "' + qRaw + '".';
  syncClear();
  syncAutoPausedUI();
}

function syncClear() {
  const clear = $("#clearbtn");
  const hasFilter = activeFilter && activeFilter !== "all";
  const hasSearch = $("#search").value.trim().length > 0;
  clear.disabled = !(hasFilter || hasSearch);
}

function highlightMatches(card, q) {
  card.querySelectorAll("mark.hl").forEach(m => {
    const t = document.createTextNode(m.textContent);
    m.replaceWith(t);
  });
  card.normalize();
  if (!q) return;
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return;
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (n.parentElement && n.parentElement.closest("button, a")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(" + terms.map(escRe).join("|") + ")", "gi");
  for (const n of nodes) {
    if (!re.test(n.nodeValue)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    const txt = n.nodeValue;
    while ((m = re.exec(txt)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      const mark = document.createElement("mark");
      mark.className = "hl";
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
    }
    if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last, txt.length)));
    n.replaceWith(frag);
  }
}

function syncGroupsOpen() {
  // Severity mode: filtering reveals the group — open it so findings are
  // visible right away. On "All", only High opens (progressive disclosure:
  // Informational can hold dozens of items); a specific severity opens its
  // own group. Category mode: leave expansion to the user.
  document.querySelectorAll("#report .group").forEach((g) => {
    if (g.dataset.type === "cat") return;
    g.open = activeFilter === g.dataset.key || (activeFilter === "all" && g.dataset.key === "high");
  });
  syncAutoPausedUI();
}
