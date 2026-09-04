/* === Theme toggle === */
function currentTheme() { try { return localStorage.getItem("ld-theme") || "auto"; } catch { return "auto"; } }
/* Theme button icon: crescent for dark, sun for light — each wrapped in the
   .ico pattern so the emoji shows only if inline SVG ever fails to render. */
const THEME_ICON_MOON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span class="fb">🌙</span>';
const THEME_ICON_SUN  = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="fb">☀️</span>';

const THEME_ICON_TERM = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 5l7 7-7 7M12 19h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="fb">&gt;_</span>';

function applyTheme() {
  const t = currentTheme();
  const theme = t === "terminal" ? "terminal"
    : t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark"
    : "light";
  document.documentElement.setAttribute("data-theme", theme);
  const btn = $("#theme");
  if (btn) {
    btn.innerHTML = '<span class="ico" aria-hidden="true">' + (theme === "terminal" ? THEME_ICON_TERM : theme === "dark" ? THEME_ICON_MOON : THEME_ICON_SUN) + "</span>";
    btn.title = "Theme: " + t + " \u2014 click to change";
  }
}
function cycleTheme() {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(currentTheme()) + 1) % THEME_ORDER.length];
  try { localStorage.setItem("ld-theme", next); } catch {}
  applyTheme();
}
