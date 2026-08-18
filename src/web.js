/**
 * Local web dashboard. `doctor --web` serves a dark, card-based report in the
 * browser at 127.0.0.1. Zero dependencies: plain node:http + inline HTML/CSS/JS.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { exec } from "node:child_process";
import { addIgnore } from "./ignore.js";

/**
 * Start the dashboard. `collect` must return { system, findings, generatedAt }.
 * `render` post-processes the report before it is served at /api/report — pass
 * one to make the endpoint emit the same versioned envelope as --json.
 * `quiet` suppresses the URL banner on stdout — needed when embedding the
 * server in tests, where stdout must stay a clean TAP stream.
 */
export async function startWeb({ collect, history = () => [], checkList = async () => [], port = 0, open = true, quiet = false, render = (d) => d }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/report") {
      try {
        const data = await collect();
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        // render lets the caller serve the same versioned envelope as --json
        // (schemaVersion, tool, version) instead of the raw internal shape.
        // renderJson returns a string, so pass it through as-is.
        const out = render(data);
        res.end(typeof out === "string" ? out : JSON.stringify(out));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (url.pathname === "/api/history" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ runs: history() }));
      return;
    }
    if (url.pathname === "/api/checks" && req.method === "GET") {
      try {
        const checks = await checkList();
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ checks }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (url.pathname === "/api/ignore" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const pattern = JSON.parse(body || "{}").pattern;
        const ok = addIgnore(pattern);
        res.writeHead(ok ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
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
  if (!quiet) console.log(`🩺 Linux Doctor dashboard: ${url}  (Ctrl+C to stop)`);
  return server;
}

const PAGE = readFileSync(new URL("../src-gui/index.html", import.meta.url), "utf8");
