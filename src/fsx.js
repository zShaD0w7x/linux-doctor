/**
 * Atomic, permissioned file writes.
 *
 * Used for every state file the tool owns (config, history, support bundle,
 * systemd units). Two classes of bug this closes:
 *
 *  - Predictable temp names: a fixed `${file}.tmp` can be pre-created as a
 *    symlink in a shared directory, and a plain writeFileSync follows it.
 *    Here the temp sibling is opened O_CREAT|O_EXCL with a unique name, so
 *    a planted link makes the open fail instead of writing through it; the
 *    final rename() replaces whatever sits at `file` (rename never follows
 *    the final component).
 *  - Loose permissions: config.json may hold a Pro license key, and history
 *    paths embed the username, so files default to 0600 inside a 0700 dir.
 */
import { closeSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Atomically write `data` to `file`. Returns true on success, false when the
 * write could not be performed (callers treat their state files as optional).
 */
export function atomicWrite(file, data, { mode = 0o600, dirMode = 0o700 } = {}) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  let fd;
  try {
    mkdirSync(dirname(file), { recursive: true, mode: dirMode });
    fd = openSync(tmp, "wx", mode);
    writeSync(fd, data);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, file);
    return true;
  } catch {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
    try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
    return false;
  }
}
