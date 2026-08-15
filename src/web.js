/**
 * Local web dashboard. `doctor --web` serves a dark, card-based report in the
 * browser at 127.0.0.1. Zero dependencies: plain node:http + inline HTML/CSS/JS.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
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

const PAGE = readFileSync(new URL("../src-gui/index.html", import.meta.url), "utf8");
