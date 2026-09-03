/* === Schedule strip: is the daily check actually scheduled? ===
   The dashboard used to know only "Re-run now". This strip answers the
   follow-up question — will the machine check itself tomorrow? Read-only:
   installing stays a CLI decision; the strip shows state plus the exact
   command to copy. Hidden when the backend has no schedule to report
   (static --html exports, unreachable API). */

async function fetchSchedule() {
  if (STATIC_DATA) return null;
  try {
    const res = await fetch("/api/schedule", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).schedule || null;
  } catch {
    return null;
  }
}

function browserNotifyState() {
  try {
    if (!("Notification" in window)) return "unavailable";
    if (Notification.permission === "granted") return "on";
    return "off";
  } catch {
    return "unavailable";
  }
}

/* Pure (string in, string out) so dashboard-state.test.js can pin it. */
function scheduleHtml(s, notify) {
  if (!s) return "";
  const dot = (on) => '<span class="dot' + (on ? "" : " stale") + '" aria-hidden="true"></span>';
  const notifyBit = notify === "unavailable" ? ""
    : '<span class="sched-sep" aria-hidden="true">·</span><span>' + dot(notify === "on") +
      "Browser alerts " + (notify === "on" ? "on" : "off") + "</span>";
  if (!s.installed) {
    return dot(false) + "<span><b>Daily check off</b> — install the timer and the machine notifies you only when something new breaks.</span>" +
      '<button class="toolbtn" data-copy="linux-doctor --install-timer">Copy setup command</button>' + notifyBit;
  }
  if (s.active) {
    return dot(true) + "<span><b>Daily check on</b> — runs after boot, then daily · notifies only on new findings.</span>" + notifyBit;
  }
  return dot(false) + "<span><b>Daily check needs attention</b> — timer units exist but the timer isn't active. Re-run <span class=\"mono\">linux-doctor --install-timer</span>.</span>" +
    '<button class="toolbtn" data-copy="linux-doctor --install-timer">Copy setup command</button>' + notifyBit;
}

function renderSchedule(s) {
  const el = $("#schedstrip");
  if (!el) return;
  const html = scheduleHtml(s, browserNotifyState());
  if (!html) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = html;
}

function refreshSchedule() {
  fetchSchedule().then(renderSchedule);
}
