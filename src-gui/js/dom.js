/* === DOM helpers === */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* JS smooth-scrolls bypass the CSS reduced-motion guard, so gate the behavior here. */
function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");
let lastReportData = null;
let lastData = null;
