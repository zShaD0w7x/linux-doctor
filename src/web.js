/**
 * Local web dashboard. `doctor --web` serves a dark, card-based report in the
 * browser at 127.0.0.1. Zero dependencies: plain node:http + inline HTML/CSS/JS.
 */
import http from "node:http";
import { exec } from "node:child_process";

/** Start the dashboard. `collect` must return { system, findings, generatedAt }. */
export async function startWeb({ collect, port = 0, open = true }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/report") {
      try {
        const data = await collect();
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  if (open) {
    try {
      exec(`xdg-open "${url}" >/dev/null 2>&1 &`, () => {});
    } catch {
      /* browser may not exist; the printed URL is enough */
    }
  }
  console.log(`🩺 Linux Doctor dashboard: ${url}  (Ctrl+C to stop)`);
  return server;
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Linux Doctor</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🩺</text></svg>">
<style>
  :root {
    --bg: #0f1115; --card: #1a1d24; --card2: #21252e; --border: #2a2f3a;
    --text: #e6e9ef; --muted: #9aa3b2;
    --red: #ff5c5c; --yellow: #ffc94d; --green: #3ddc84; --blue: #7aa2f7;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 32px 20px 64px; }
  .wrap { max-width: 860px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
  header .logo { font-size: 34px; }
  h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .sysinfo { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .actions { margin-left: auto; display: flex; gap: 8px; }
  button {
    background: var(--card2); color: var(--text); border: 1px solid var(--border);
    padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; transition: background .15s;
  }
  button:hover { background: #2a2f3a; }
  button.primary { background: #2d5bff; border-color: #2d5bff; }
  button.primary:hover { background: #3a68ff; }
  .banner { border-radius: 12px; padding: 16px 18px; margin-bottom: 20px; font-size: 15px; border: 1px solid var(--border); }
  .banner.ok { background: rgba(61,220,132,.08); border-color: rgba(61,220,132,.35); color: var(--green); }
  .banner.warn { background: rgba(255,92,92,.08); border-color: rgba(255,92,92,.35); color: var(--red); }
  .chips { display: flex; gap: 8px; margin-bottom: 26px; flex-wrap: wrap; }
  .chip { padding: 6px 12px; border-radius: 999px; font-size: 13px; border: 1px solid var(--border); background: var(--card); }
  .chip b { font-weight: 700; }
  .chip.red { color: var(--red); } .chip.yellow { color: var(--yellow); } .chip.blue { color: var(--blue); }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 26px 0 12px; }
  .card { background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--muted); border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; }
  .card.high { border-left-color: var(--red); }
  .card.medium { border-left-color: var(--yellow); }
  .card.info { border-left-color: var(--blue); }
  .card-head { display: flex; align-items: baseline; gap: 10px; }
  .badge { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 2px 8px; border-radius: 6px; }
  .badge.high { background: rgba(255,92,92,.15); color: var(--red); }
  .badge.medium { background: rgba(255,201,77,.15); color: var(--yellow); }
  .badge.info { background: rgba(122,162,247,.15); color: var(--blue); }
  .card h3 { font-size: 15px; font-weight: 600; }
  .card .detail { color: var(--text); margin-top: 8px; font-size: 14px; }
  .evidence { margin-top: 10px; background: #10131a; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-family: var(--mono); font-size: 12px; color: var(--muted); white-space: pre-wrap; word-break: break-word; }
  details.ev { margin-top: 10px; }
  summary { cursor: pointer; color: var(--blue); font-size: 13px; user-select: none; }
  .fix { margin-top: 10px; display: flex; gap: 8px; align-items: flex-start; }
  .fix .fixtext { background: var(--card2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-family: var(--mono); font-size: 12.5px; flex: 1; color: var(--text); }
  .fix button { flex-shrink: 0; }
  footer { margin-top: 40px; color: var(--muted); font-size: 12.5px; text-align: center; }
  .empty { text-align: center; color: var(--muted); padding: 40px 0; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="logo">🩺</span>
    <div>
      <h1>Linux Doctor</h1>
      <div class="sysinfo" id="sysinfo">Loading system info…</div>
    </div>
    <div class="actions">
      <button id="rerun" class="primary">↻ Re-run checks</button>
    </div>
  </header>
  <div id="banner" class="banner">Running checks…</div>
  <div class="chips" id="chips"></div>
  <div id="report"><div class="empty">Running checks…</div></div>
  <footer>Linux Doctor only reads system information — it never modifies anything.</footer>
</div>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SEV = { high: { label: "High", cls: "high" }, medium: { label: "Medium", cls: "medium" }, info: { label: "Info", cls: "info" } };

async function load() {
  const res = await fetch("/api/report", { cache: "no-store" });
  const data = await res.json();
  render(data);
}

function render(data) {
  const { findings = [], system = {} } = data;
  $("#sysinfo").textContent = system.distro + " · " + system.kernel + " · " + (system.cores || "?") + " core(s) · up " + system.uptime;
  const count = (s) => findings.filter((f) => f.severity === s).length;
  const high = count("high"), med = count("medium"), inf = count("info");

  const banner = $("#banner");
  if (high + med === 0) {
    banner.className = "banner ok";
    banner.textContent = "✅ Your system looks healthy. No high or medium issues found.";
  } else {
    banner.className = "banner warn";
    banner.textContent = "🩺 Found " + high + " high-severity and " + med + " medium-severity issue(s). " +
      (high > 0 ? "Start with the red ones." : "Worth taking a look.");
  }

  $("#chips").innerHTML =
    '<span class="chip red"><b>' + high + '</b> high</span>' +
    '<span class="chip yellow"><b>' + med + '</b> medium</span>' +
    '<span class="chip blue"><b>' + inf + '</b> info</span>';

  const order = ["high", "medium", "info"];
  const names = { high: "High severity", medium: "Medium severity", info: "Informational" };
  let html = "";
  for (const sev of order) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    html += "<h2>" + names[sev] + "</h2>";
    for (const f of group) {
      html += '<div class="card ' + SEV[sev].cls + '">';
      html += '<div class="card-head"><span class="badge ' + SEV[sev].cls + '">' + SEV[sev].label + "</span><h3>" + esc(f.title) + "</h3></div>";
      if (f.detail) html += '<div class="detail">' + esc(f.detail) + "</div>";
      if (f.evidence) {
        html += '<details class="ev"><summary>Evidence</summary><div class="evidence">' + esc(f.evidence) + "</div></details>";
      }
      if (f.fix) {
        html += '<div class="fix"><div class="fixtext">' + esc(f.fix) + '</div><button data-copy="' + esc(f.fix) + '">Copy</button></div>';
      }
      html += "</div>";
    }
  }
  $("#report").innerHTML = html || '<div class="empty">No findings.</div>';
}

document.addEventListener("click", async (e) => {
  if (e.target.dataset.copy !== undefined) {
    await navigator.clipboard.writeText(e.target.dataset.copy);
    const old = e.target.textContent;
    e.target.textContent = "✓ Copied";
    setTimeout(() => (e.target.textContent = old), 1200);
  }
});

$("#rerun").addEventListener("click", load);
load();
</script>
</body>
</html>`;
