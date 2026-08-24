/* === Central state store === */
const SEV = { high: { label: "High", cls: "high" }, medium: { label: "Medium", cls: "medium" }, info: { label: "Info", cls: "info" } };
const SEV_ICONS = { high: "\u{1f534}", medium: "\u{1f7e1}", info: "\u{1f535}" };
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
