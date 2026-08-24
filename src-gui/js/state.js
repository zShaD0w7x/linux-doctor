/* === Central state store === */
const SEV = { high: { label: "High", cls: "high" }, medium: { label: "Medium", cls: "medium" }, info: { label: "Info", cls: "info" } };

/* Severity markers as inline SVG (theme-colored via CSS), not emoji —
   identical rendering everywhere, no font dependency, crisp at any scale.
   Inside filter pills they inherit currentColor so active states invert. */
const SEV_ICONS = {
  high: '<svg class="sevdot" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5"/></svg>',
  medium: '<svg class="sevdot" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5"/></svg>',
  info: '<svg class="sevdot" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5"/></svg>',
};
const ICON_ALL = '<svg class="sevdot" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke-width="2"/></svg>';
const LOGO_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M2 13h4l2.5-7 4 12 3-8 1.5 3H22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BELL_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 16h15L18 12.5V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TIMER_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l2.5 2.5M9 2h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const SEV_ORDER = ["high", "medium", "info"];
const SEV_NAMES = { high: "High severity", medium: "Medium severity", info: "Informational" };
const THEME_ORDER = ["light", "dark", "auto"];
const POLL_MS = 20000;
/* Category grouping: known check categories in display order; anything
   unmapped (plugins, older payloads) lands under "other". */
const CATEGORY_ORDER = ["system", "software", "security", "network", "updates", "hardware", "data", "other"];
const CATEGORY_LABELS = {
  system: "System", software: "Software", security: "Security",
  network: "Network", updates: "Updates", hardware: "Hardware",
  data: "Data", other: "Other",
};
/* How findings are grouped in the report: "severity" | "category". */
let groupBy = "severity";
/* check id → category, filled from /api/checks before the first render. */
let checksCategoryMap = new Map();
