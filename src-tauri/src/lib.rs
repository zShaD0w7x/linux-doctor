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
//!
//! Every Node child process strips LD_LIBRARY_PATH/LD_PRELOAD: inside the
//! AppImage those point at the bundled libraries, and the host's `node`
//! would otherwise load them and abort (symbol/version mismatch).

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

/// Resolves the Node interpreter used to run the CLI, in priority order:
/// 1. `$LINUX_DOCTOR_NODE` — explicit override for custom installs.
/// 2. `<resources>/runtime/node` — a bundled runtime shipped inside the
///    package (future-proofing: release packaging can drop a Node binary
///    there so end users need nothing on their PATH).
/// 3. Plain `"node"` from PATH — the common case today.
fn node_bin(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(p) = std::env::var("LINUX_DOCTOR_NODE") {
        let b = PathBuf::from(&p);
        if !p.is_empty() && b.is_file() {
            return b;
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        let b = dir.join("runtime").join("node");
        if b.is_file() {
            return b;
        }
    }
    PathBuf::from("node")
}

/// Runs every check via the Node CLI and returns the raw JSON report bytes.
/// Exit code 0 (healthy) and 1 (findings found) are both valid reports.
fn collect_report(root: &PathBuf, node: &PathBuf) -> Result<Vec<u8>, String> {
    let out = Command::new(node)
        .args(["bin/doctor.js", "--json"])
        .current_dir(root)
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("LD_PRELOAD")
        .output()
        .map_err(|e| {
            format!(
                "Could not run Node.js ({e}). Linux Doctor needs Node.js >= 20 with `node` on your PATH — or set LINUX_DOCTOR_NODE to a Node binary."
            )
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

/// Runs the CLI's check catalog (`--check-list`) and wraps it as
/// `{"checks": [...]}` — the shape the dashboard expects from `/checks`.
/// Used for check→category grouping and the checks matrix. Static metadata,
/// no system scanning, so this is cheap.
fn collect_checks(root: &PathBuf, node: &PathBuf) -> Result<Vec<u8>, String> {
    let out = Command::new(node)
        .args(["bin/doctor.js", "--check-list"])
        .current_dir(root)
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("LD_PRELOAD")
        .output()
        .map_err(|e| {
            format!(
                "Could not run Node.js ({e}). Linux Doctor needs Node.js >= 20 with `node` on your PATH — or set LINUX_DOCTOR_NODE to a Node binary."
            )
        })?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(format!(
            "linux-doctor --check-list exited with code {}.\n{stderr}",
            out.status.code().unwrap_or(-1)
        ));
    }
    let list: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("Could not parse the check list: {e}"))?;
    serde_json::to_vec(&serde_json::json!({ "checks": list }))
        .map_err(|e| format!("Could not serialize the check list: {e}"))
}

/// Runs the Node CLI with the given arguments and returns (exit_code, stdout, stderr).
/// A spawn failure (no Node) is reported as exit code 127 with the OS error text.
fn run_cli(root: &PathBuf, node: &PathBuf, args: &[&str]) -> (i32, String, String) {
    match Command::new(node).args(args).current_dir(root).env_remove("LD_LIBRARY_PATH").env_remove("LD_PRELOAD").output() {
        Ok(out) => (
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stdout).trim().to_string(),
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ),
        Err(e) => (
            127,
            String::new(),
            format!(
                "Could not run Node.js ({e}). Linux Doctor needs Node.js >= 20 with `node` on your PATH — or set LINUX_DOCTOR_NODE to a Node binary."
            ),
        ),
    }
}

/// Serves the dashboard API (and CORS preflight) on loopback. Runs in a
/// background thread; each connection is handled on its own thread so
/// "Re-run checks" can overlap safely (all checks are read-only; the POST
/// endpoints only write the app's own config/history files).
fn serve_report(root: PathBuf, node: PathBuf) {
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
            let node = node.clone();
            thread::spawn(move || handle_client(stream, &root, &node));
        }
    });
}

/// Extracts Content-Length from raw request head bytes (0 when absent/invalid).
fn content_length(head: &[u8]) -> usize {
    let head = String::from_utf8_lossy(head);
    for line in head.lines() {
        let mut parts = line.splitn(2, ':');
        let name = parts.next().unwrap_or("").trim().to_ascii_lowercase();
        if name == "content-length" {
            return parts.next().unwrap_or("").trim().parse().unwrap_or(0);
        }
    }
    0
}

fn handle_client(mut stream: TcpStream, root: &PathBuf, node: &PathBuf) {
    // Read the full request head, then any POST body (the config-writing
    // endpoints carry small JSON payloads). Capped well below any sane size.
    let mut data: Vec<u8> = Vec::with_capacity(4096);
    let mut buf = [0u8; 4096];
    let head_end = loop {
        if let Some(pos) = data.windows(4).position(|w| w == b"\r\n\r\n") {
            let need = pos + 4 + content_length(&data[..pos]);
            if data.len() >= need {
                break Some(pos);
            }
        }
        if data.len() > 256 * 1024 {
            break None;
        }
        let n = stream.read(&mut buf).unwrap_or(0);
        if n == 0 {
            break None;
        }
        data.extend_from_slice(&buf[..n]);
    };

    let (method, path, body) = match head_end {
        Some(pos) => {
            let head = String::from_utf8_lossy(&data[..pos]).to_string();
            let mut parts = head.lines().next().unwrap_or("").split_whitespace();
            let method = parts.next().unwrap_or("").to_string();
            let path = parts.next().unwrap_or("").to_string();
            let cl = content_length(&data[..pos]).min(256 * 1024);
            let end = (pos + 4 + cl).min(data.len());
            let body = String::from_utf8_lossy(&data[pos + 4..end]).to_string();
            (method, path, body)
        }
        None => (String::new(), String::new(), String::new()),
    };

    const CORS: &str = "Access-Control-Allow-Origin: *\r\n\
                        Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                        Access-Control-Allow-Headers: Content-Type";

    // Shells out to the CLI; exit 0 → 200 with stdout, exit 1 → 400 with
    // stdout (the CLI prints {ok:false,...}), anything else → 500.
    let cli_json = |args: &[&str]| -> (&'static str, Vec<u8>) {
        let (code, stdout, stderr) = run_cli(root, node, args);
        match code {
            0 => ("200 OK", stdout.into_bytes()),
            1 => ("400 Bad Request", stdout.into_bytes()),
            _ => (
                "500 Internal Server Error",
                serde_json::to_vec(&serde_json::json!({ "error": stderr })).unwrap_or_default(),
            ),
        }
    };

    let (status, body) = match (method.as_str(), path.as_str()) {
        ("OPTIONS", _) => ("204 No Content", Vec::new()),
        ("GET", "/report") | ("GET", "/report/") => match collect_report(root, node) {
            Ok(bytes) => ("200 OK", bytes),
            Err(msg) => (
                "500 Internal Server Error",
                serde_json::to_vec(&serde_json::json!({ "error": msg })).unwrap_or_default(),
            ),
        },
        ("GET", "/checks") | ("GET", "/checks/") => match collect_checks(root, node) {
            Ok(bytes) => ("200 OK", bytes),
            Err(msg) => (
                "500 Internal Server Error",
                serde_json::to_vec(&serde_json::json!({ "error": msg })).unwrap_or_default(),
            ),
        },
        ("GET", "/history") | ("GET", "/history/") => cli_json(&["bin/doctor.js", "--history-json"]),
        ("GET", "/thresholds") | ("GET", "/thresholds/") => cli_json(&["bin/doctor.js", "--thresholds-json"]),
        ("POST", "/thresholds") | ("POST", "/thresholds/") => {
            cli_json(&["bin/doctor.js", "--thresholds-set", &body])
        }
        ("POST", "/api/ignore") | ("POST", "/api/ignore/") => {
            let pattern = serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|v| v.get("pattern").and_then(|p| p.as_str()).map(String::from));
            match pattern {
                Some(p) if !p.is_empty() => {
                    let (status, bytes) = cli_json(&["bin/doctor.js", "--ignore-add", &p]);
                    if status == "200 OK" {
                        (
                            "200 OK",
                            serde_json::to_vec(&serde_json::json!({ "ok": true })).unwrap_or_default(),
                        )
                    } else {
                        (status, bytes)
                    }
                }
                _ => (
                    "400 Bad Request",
                    serde_json::to_vec(&serde_json::json!({ "ok": false })).unwrap_or_default(),
                ),
            }
        }
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
    software_gl_fallback();
    tauri::Builder::default()
        .setup(|app| {
            let root = repo_root(app.handle());
            let node = node_bin(app.handle());
            serve_report(root, node);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Linux Doctor");
}

/// Inside the AppImage, the bundled WebKitGTK comes from an older LTS base
/// and its accelerated paths can abort against a bleeding-edge host Mesa
/// ("Could not create default EGL display") — on AMD and Intel alike, since
/// both run on Mesa (NVIDIA's proprietary driver ships its own stack). A
/// diagnostics dashboard does not need GPU acceleration, so when running
/// from an AppImage we default to software GL before any GTK/WebKit code
/// initializes. Opt out with LINUX_DOCTOR_HARDWARE_GL=1. The .deb and CLI
/// are untouched: they use the host's matching WebKitGTK.
fn software_gl_fallback() {
    let appimage = std::env::var_os("APPIMAGE").is_some();
    let already_set = std::env::var_os("LIBGL_ALWAYS_SOFTWARE").is_some();
    let hardware_requested = std::env::var("LINUX_DOCTOR_HARDWARE_GL")
        .map(|v| v == "1")
        .unwrap_or(false);
    if appimage && !already_set && !hardware_requested {
        std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
        eprintln!(
            "linux-doctor: running from an AppImage — defaulting to software GL \
             (set LINUX_DOCTOR_HARDWARE_GL=1 to use hardware rendering)"
        );
    }
}
