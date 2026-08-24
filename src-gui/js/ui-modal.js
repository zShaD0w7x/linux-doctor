/* === Shared modal shell === */
function openModal(html) {
  const modal = $("#modal");
  const body = $("#modal-body");
  if (!modal || !body) return;
  body.innerHTML = html;
  modal.hidden = false;
  $("#modal-x")?.focus();
}

function closeModal() {
  const modal = $("#modal");
  if (modal && !modal.hidden) modal.hidden = true;
}

function isModalOpen() {
  const modal = $("#modal");
  return !!modal && !modal.hidden;
}

function setupModal() {
  const modal = $("#modal");
  if (!modal) return;
  // Backdrop click closes; clicks inside the card do not.
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  $("#modal-x")?.addEventListener("click", closeModal);
}

/* Keyboard shortcuts help (?). */
function openHelp() {
  openModal(
    '<div class="mx-head">Keyboard shortcuts</div>' +
    '<div class="mx-sub">Everything works with the mouse too.</div>' +
    '<div class="help-grid">' +
    "<div><kbd>\u2191</kbd> <kbd>\u2193</kbd></div><div>Navigate findings</div>" +
    "<div><kbd>Enter</kbd> / <kbd>Space</kbd></div><div>Open or close a finding</div>" +
    "<div><kbd>/</kbd></div><div>Focus the search box</div>" +
    "<div><kbd>Esc</kbd></div><div>Close this dialog \u00b7 clear search &amp; filters \u00b7 close thresholds</div>" +
    '<div><kbd>?</kbd></div><div>Show this help</div>' +
    "</div>");
}
