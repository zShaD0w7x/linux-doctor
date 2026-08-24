/* === Browser desktop notifications === */
function maybeNotify(data) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const hasHigh = (data.findings || []).some(f => f.severity === "high");
    const newHigh = ((data.diffSinceLast && data.diffSinceLast.added) || []).some(f => f.severity === "high" || f.severity === "medium");
    const degraded = (typeof data.scoreDelta === "number" && data.scoreDelta < 0 && data.score < 80) || (hasHigh && newHigh);
    if (!degraded) return;
    const key = "ld-notify-" + data.score + "-" + (data.generatedAt || "");
    const last = localStorage.getItem(key);
    if (last) return;
    localStorage.setItem(key, "1");
    setTimeout(() => localStorage.removeItem(key), 10 * 60 * 1000);
    const title = hasHigh ? "Linux Doctor: health degraded (" + data.score + "/100)" : "Linux Doctor: new findings";
    const body = (data.changeMessage || (data.newCount ? data.newCount + " new \u00b7 " + data.fixedCount + " fixed" : "")) + " \u2014 open dashboard for details";
    new Notification(title, { body, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>\u{1fa7a}</text></svg>" });
  } catch {}
}

function setupNotifyButton() {
  const notifyBtn = $("#notifybtn");
  if (!notifyBtn) return;
  const syncNotifyBtn = () => {
    if (!("Notification" in window)) { notifyBtn.style.display = "none"; return; }
    notifyBtn.textContent = Notification.permission === "granted" ? "\u{1f514}\u2713" : "\u{1f514}";
    notifyBtn.title = Notification.permission === "granted" ? "Notifications enabled" : "Enable desktop notifications when health degrades";
    notifyBtn.classList.toggle("on", Notification.permission === "granted");
  };
  syncNotifyBtn();
  notifyBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) { showToast("Notifications not supported in this browser"); return; }
    if (Notification.permission === "granted") { showToast("\u{1f514} Notifications already enabled"); return; }
    const perm = await Notification.requestPermission();
    syncNotifyBtn();
    showToast(perm === "granted" ? "\u{1f514} Notifications enabled" : "Notifications not granted");
    if (perm === "granted" && lastData) maybeNotify(lastData);
  });
}
