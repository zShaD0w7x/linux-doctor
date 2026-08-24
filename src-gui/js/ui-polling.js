/* === Auto-refresh polling === */
let autoRefresh = true;
let pollTimer = null;
let pollBusy = false;

function reportSignature(d) {
  if (!d) return "";
  return JSON.stringify([d.generatedAt || "", d.score || 0, d.scoreDelta || 0, d.findings || [], d.diffSinceLast || null]);
}

function pollPaused() {
  if (!autoRefresh || document.hidden || pollBusy) return true;
  if ($("#rerun").disabled) return true;
  if ($("#search").value.trim()) return true;
  if (activeFilter && activeFilter !== "all") return true;
  return document.querySelectorAll("#report details[open]").length > 0;
}

function syncAutoPausedUI() {
  const autoBtn = $("#autorefresh");
  if (!autoBtn) return;
  const paused = pollPaused();
  autoBtn.classList.toggle("paused", paused && autoRefresh);
  if (!autoRefresh) autoBtn.title = "Auto-refresh off \u2014 click to enable";
  else if (paused) autoBtn.title = "Paused \u2014 clear filter/search or collapse cards to resume";
  else autoBtn.title = "Auto-refresh every 20s";
}

async function poll() {
  if (pollPaused()) return;
  pollBusy = true;
  try {
    const data = await fetchReport();
    if (reportSignature(data) !== reportSignature(lastData)) {
      render(data);
      // Quiet confirmation that the background refresh changed something —
      // a green pulse on the Auto button, gone in ~1.5s. No toast noise.
      const btn = $("#autorefresh");
      if (btn) {
        btn.classList.add("updated");
        setTimeout(() => btn.classList.remove("updated"), 1600);
      }
    }
  } catch {}
  finally { pollBusy = false; }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, POLL_MS);
}

function setupPolling() {
  const autoBtn = $("#autorefresh");
  if (autoBtn) {
    autoBtn.addEventListener("click", () => {
      autoRefresh = !autoRefresh;
      autoBtn.classList.toggle("on", autoRefresh);
      syncAutoPausedUI();
      showToast(autoRefresh ? "\u23f1 Auto-refresh on" : "\u23f8 Auto-refresh off");
    });
  }
  setInterval(syncAutoPausedUI, 1000);
  document.addEventListener("toggle", (e) => {
    if (e.target.matches("#report details")) syncAutoPausedUI();
    if (e.target.classList.contains("ev") && e.target.open) {
      const ev = e.target.querySelector(".evidence");
      const btn = e.target.querySelector(".ev-expand");
      if (ev && btn && ev.scrollHeight > 228) btn.hidden = false;
    }
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearInterval(pollTimer); }
    else { startPolling(); }
  });
}
