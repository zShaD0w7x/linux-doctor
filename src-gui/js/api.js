/* === Data fetching === */
const isDesktop = () => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
const STATIC_DATA = typeof window !== "undefined" && window.__DATA__ ? window.__DATA__ : null;

async function fetchReport() {
  if (STATIC_DATA) return STATIC_DATA;
  if (isDesktop()) {
    try {
      const res = await fetch("http://127.0.0.1:17321/report", { cache: "no-store" });
      if (res.ok) return res.json();
    } catch {}
  }
  const res = await fetch("/api/report", { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function fetchHistory() {
  if (STATIC_DATA) return [];
  if (isDesktop()) {
    try {
      const res = await fetch("http://127.0.0.1:17321/history", { cache: "no-store" });
      if (res.ok) return (await res.json()).runs || [];
    } catch {}
  }
  try {
    const res = await fetch("/api/history", { cache: "no-store" });
    if (res.ok) return (await res.json()).runs || [];
  } catch {}
  return [];
}

async function fetchChecks() {
  if (STATIC_DATA) return [];
  if (isDesktop()) {
    try {
      const res = await fetch("http://127.0.0.1:17321/checks", { cache: "no-store" });
      if (res.ok) return (await res.json()).checks || [];
    } catch {}
  }
  try {
    const res = await fetch("/api/checks", { cache: "no-store" });
    if (res.ok) return (await res.json()).checks || [];
  } catch {}
  return [];
}

/* check id → category map, fetched once and reused across renders.
   Fills the shared checksCategoryMap; never throws. */
async function loadCategoryMap() {
  try {
    const list = await fetchChecks();
    checksCategoryMap = new Map(list.map((c) => [c.id, c.category || "other"]));
  } catch {
    checksCategoryMap = new Map();
  }
  return checksCategoryMap;
}
