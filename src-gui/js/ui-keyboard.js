/* === Keyboard navigation === */
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");

    // "/" focuses search (unless the user is already typing somewhere).
    if (e.key === "/" && !typing) {
      e.preventDefault();
      $("#search")?.focus();
      return;
    }

    // "?" opens the shortcuts help (Shift+/ — same key without typing context).
    if (e.key === "?" && !typing) {
      e.preventDefault();
      openHelp();
      return;
    }

    // Escape: close the modal, then the thresholds panel, else clear search+filter.
    if (e.key === "Escape") {
      if (isModalOpen()) { closeModal(); return; }
      const panel = $("#threshpanel");
      if (panel && !panel.hidden) { panel.hidden = true; return; }
      if (!typing && (activeFilter !== "all" || $("#search").value)) {
        activeFilter = "all";
        $("#search").value = "";
        document.querySelectorAll(".fpill").forEach((b) => b.classList.toggle("active", b.dataset.sev === "all"));
        syncGroupsOpen();
        applyFilters();
      }
      return;
    }

    // "1..5" jump between app views (not while typing).
    if ((e.key >= "1" && e.key <= "5") && !typing) {
      e.preventDefault();
      switchView(["overview", "history", "checks", "system", "schedule"][Number(e.key) - 1]);
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Card navigation belongs to Overview — never steal focus from a
      // hidden report while the user reads History or Checks.
      if (document.getElementById("view-overview")?.hidden) return;
      const cards = [...document.querySelectorAll("#report .card, #report .crow")];
      if (!cards.length) return;
      let idx = cards.indexOf(document.activeElement);
      if (e.key === "ArrowDown") idx = idx < 0 ? 0 : Math.min(cards.length - 1, idx + 1);
      else idx = idx < 0 ? 0 : Math.max(0, idx - 1);
      e.preventDefault();
      cards[idx].focus({ preventScroll: true });
      cards[idx].scrollIntoView({ block: "nearest" });
    } else if ((e.key === "Enter" || e.key === " ") && document.activeElement && (document.activeElement.classList.contains("card") || document.activeElement.classList.contains("crow"))) {
      const el = document.activeElement;
      if (el.open) el.removeAttribute("open");
      else el.setAttribute("open", "");
      e.preventDefault();
    }
  });
}

function setAllOpen(open) {
  document.querySelectorAll("#report .group, #report .card, #report .crow").forEach((el) => {
    if (open) el.setAttribute("open", "");
    else el.removeAttribute("open");
  });
  const btn = $("#expandall");
  if (btn) btn.textContent = open ? "\u229f Collapse all" : "\u229e Expand all";
}
