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
  // Dot and label wrap as one unit — a separator stranded at line end reads
  // as a dangling bullet on narrow screens.
  const notifyBit = notify === "unavailable" ? ""
    : '<span class="sched-note"><span class="sched-sep" aria-hidden="true">·</span><span>' + dot(notify === "on") +
      "Browser alerts " + (notify === "on" ? "on" : "off") + "</span></span>";
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

/* The shared notices row is visible when at least one notice is. Both
   renderers call this after updating, so async schedule fetches and sync
   posture renders converge on the same visibility. */
function syncNotices() {
  const wrap = $("#notices");
  if (!wrap) return;
  const kids = [...wrap.children];
  wrap.hidden = kids.length === 0 || kids.every((k) => k.hidden);
  syncNoticeGrid();
}

function renderSchedule(s) {
  const el = $("#schedstrip");
  if (!el) return;
  const html = scheduleHtml(s, browserNotifyState());
  if (!html) { el.hidden = true; el.innerHTML = ""; }
  else { el.hidden = false; el.innerHTML = html; }
  syncNotices();
}

/* Schedule view: the full picture — status, cadence, notify state, and the
   exact commands to copy. Rendered lazily on activation (same fetch as the
   strip, no extra endpoint). Pure builder kept separate for tests. */
function scheduleViewHtml(s, notify) {
  const strip = scheduleHtml(s, notify);
  const head = '<div class="viewcard"><div class="mx-head">Scheduled checks</div>' +
    '<div class="mx-sub">The timer runs the checks for you; the machine only speaks when something new breaks</div>';
  if (!strip) {
    return head + '<div class="detail">Schedule state is unavailable (static export or unreachable API).</div></div>';
  }
  const cadence = '<div class="sysfact"><span class="sysfact-k">Cadence</span>' +
    '<span class="sysfact-v">shortly after boot, then every 24h (Persistent — catches up missed runs)</span></div>';
  const cmds = '<div class="sysfact"><span class="sysfact-k">Manage</span><span class="sysfact-v">' +
    '<button class="toolbtn" data-copy="linux-doctor --install-timer">Copy install</button> ' +
    '<button class="toolbtn" data-copy="linux-doctor --uninstall-timer">Copy remove</button></span></div>';
  const pro = '<div class="sysfact"><span class="sysfact-k">Remote delivery [Pro]</span><span class="sysfact-v">' +
    '<button class="toolbtn" data-copy="linux-doctor --alert https://ntfy.sh/your-topic">Copy alert example</button> ' +
    '<button class="toolbtn" data-copy="linux-doctor --heartbeat https://hc-ping.com/your-uuid">Copy heartbeat example</button></span></div>';
  return head + '<div class="sched sched-static">' + strip + "</div>" + cadence + cmds + pro + "</div>";
}

async function renderScheduleView() {
  const box = $("#schedview");
  if (!box) return;
  box.innerHTML = scheduleViewHtml(await fetchSchedule(), browserNotifyState());
}

function refreshSchedule() {
  fetchSchedule().then(renderSchedule);
}
