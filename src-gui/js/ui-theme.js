/* === Theme toggle === */
function currentTheme() { try { return localStorage.getItem("ld-theme") || "auto"; } catch { return "auto"; } }
function applyTheme() {
  const t = currentTheme();
  const dark = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const btn = $("#theme");
  if (btn) {
    btn.textContent = t === "light" ? "\u2600\ufe0f" : t === "dark" ? "\u{1f319}" : "\u{1f313}";
    btn.title = "Theme: " + t + " \u2014 click to change";
  }
}
function cycleTheme() {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(currentTheme()) + 1) % THEME_ORDER.length];
  try { localStorage.setItem("ld-theme", next); } catch {}
  applyTheme();
}
