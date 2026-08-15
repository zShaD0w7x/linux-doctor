//! Linux Doctor desktop shell.
//!
//! This crate is intentionally thin: it renders the shared dashboard
//! (`src-gui/index.html`) in a native window and runs the existing Node CLI
//! (`bin/doctor.js --json`) to produce the report. All health-check logic
//! lives in the Node side — the Rust code only shells out to it.
//!
//! ## Why a loopback HTTP server instead of Tauri IPC?
//!
//! Tauri's IPC relies on initialization scripts injected into the webview
//! (`window.__TAURI_INTERNALS__`). With wry 0.55 + WebKitGTK 2.52 these
//! injected scripts do not work: `__TAURI_INTERNALS__` is never defined, and
//! enabling `withGlobalTauri` breaks the page's own scripts entirely. Serving
//! the report over `127.0.0.1` is a small, dependency-free workaround — the
//! dashboard already fetches its data over HTTP in browser mode (`--web`).

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::thread;

use tauri::Manager;

/// Loopback port the report server listens on. Fixed so the frontend can find
/// it without any IPC. Must match the URL in `src-gui/index.html`.
const REPORT_PORT: u16 = 17321;

/// Where the linux-doctor Node CLI lives, in priority order:
/// 1. `$LINUX_DOCTOR_ROOT` — explicit override.
/// 2. Bundled resources — production installs (see `bundle.resources`).
/// 3. The current working directory — `tauri dev` runs from the project root.
fn repo_root(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(root) = std::env::var("LINUX_DOCTOR_ROOT") {
        let p = PathBuf::from(&root);
        if !root.is_empty() && p.join("bin").join("doctor.js").exists() {
            return p;
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        // tauri-build's glob mapping only preserves file names, so a partial
        // or stale copy is possible; require a nested file too, not just
        // `bin/doctor.js`, or we'd silently run a broken CLI.
        let candidate = dir.join("bin").join("doctor.js");
        let checks_ok = dir.join("src").join("checks").join("memory.js").exists();
        if candidate.exists() && checks_ok {
            return dir;
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("bin").join("doctor.js").exists() {
            return cwd;
        }
    }
    // Last resort — let node report the missing file.
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Runs every check via the Node CLI and returns the raw JSON report bytes.
/// Exit code 0 (healthy) and 1 (findings found) are both valid reports.
fn collect_report(root: &PathBuf) -> Result<Vec<u8>, String> {
    let out = Command::new("node")
        .args(["bin/doctor.js", "--json"])
        .current_dir(root)
        .output()
        .map_err(|e| {
            format!("Could not run Node.js: {e}. Linux Doctor needs Node.js >= 20 with `node` on your PATH.")
        })?;
    let code = out.status.code().unwrap_or(-1);
    if code != 0 && code != 1 {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        return Err(format!(
            "linux-doctor exited with code {code}.\n{stderr}\n{stdout}"
        ));
    }
    Ok(out.stdout)
}

/// Serves `GET /report` (and CORS preflight) on loopback. Runs in a background
/// thread; each connection is handled on its own thread so "Re-run checks" can
/// overlap safely (all checks are read-only).
fn serve_report(root: PathBuf) {
    thread::spawn(move || {
        let listener = match TcpListener::bind(("127.0.0.1", REPORT_PORT)) {
            Ok(listener) => listener,
            Err(err) => {
                eprintln!("⚠️  Could not start the report server on port {REPORT_PORT}: {err}");
                return;
            }
        };
        eprintln!("🩺 Linux Doctor report server: http://127.0.0.1:{REPORT_PORT}/report");
        for stream in listener.incoming().flatten() {
            let root = root.clone();
            thread::spawn(move || handle_client(stream, &root));
        }
    });
}

fn handle_client(mut stream: TcpStream, root: &PathBuf) {
    // Read the request head — we only care about the method and path.
    let mut buf = [0u8; 2048];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = String::from_utf8_lossy(&buf[..n]);
    let request_line = head.lines().next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("").to_string();

    const CORS: &str = "Access-Control-Allow-Origin: *\r\n\
                        Access-Control-Allow-Methods: GET, OPTIONS\r\n\
                        Access-Control-Allow-Headers: Content-Type";

    let (status, body) = match (method.as_str(), path.as_str()) {
        ("OPTIONS", _) => ("204 No Content", Vec::new()),
        ("GET", "/report") | ("GET", "/report/") => match collect_report(root) {
            Ok(bytes) => ("200 OK", bytes),
            Err(msg) => (
                "500 Internal Server Error",
                serde_json::to_vec(&serde_json::json!({ "error": msg })).unwrap_or_default(),
            ),
        },
        _ => (
            "404 Not Found",
            serde_json::to_vec(&serde_json::json!({ "error": "Not found" })).unwrap_or_default(),
        ),
    };

    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n{CORS}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(&body);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            serve_report(repo_root(app.handle()));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Linux Doctor");
}
