/**
 * Strict CLI argument parsing. Unknown options, unexpected positional
 * arguments, and value flags without a value are errors (exit 2) — a silent
 * typo like `--jsonn` must never quietly run a full report.
 */
const VALUE_FLAGS = new Set(["--check", "--ignore", "--push"]);
const BOOL_FLAGS = new Set(["--json", "--plain", "--web", "--ai", "--list", "--schema", "--profile"]);

export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    help: false,
    version: false,
    list: false,
    schema: false,
    profile: false,
    json: false,
    plain: false,
    web: false,
    ai: false,
    checkIds: [],
    ignore: [],
    pushUrl: null,
    error: null,
  };

  // --help/--version always win, even when other flags are wrong.
  if (args.includes("--help") || args.includes("-h")) return { ...out, help: true };
  if (args.includes("--version")) return { ...out, version: true };

  const assign = (flag, val) => {
    if (flag === "--check") out.checkIds.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
    else if (flag === "--ignore") out.ignore.push(val);
    else if (flag === "--push") out.pushUrl = val;
  };

  const example = (flag) =>
    flag === "--push" ? "https://your-server/reports" : flag === "--check" ? "memory,disk" : "fw-fanctrl";

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];

    if (BOOL_FLAGS.has(a)) {
      out[a.slice(2)] = true;
      continue;
    }

    // --flag=value form
    const eq = a.startsWith("--") ? a.indexOf("=") : -1;
    if (eq > 0) {
      const flag = a.slice(0, eq);
      if (!VALUE_FLAGS.has(flag)) {
        return { ...out, error: `Unknown option "${a}". Run "linux-doctor --help" for usage.` };
      }
      const val = a.slice(eq + 1);
      if (!val) {
        return { ...out, error: `${flag} requires a value, e.g. ${flag} ${example(flag)}` };
      }
      assign(flag, val);
      continue;
    }

    if (VALUE_FLAGS.has(a)) {
      const val = args[i + 1];
      if (val === undefined || val.startsWith("--")) {
        return { ...out, error: `${a} requires a value, e.g. ${a} ${example(a)}` };
      }
      assign(a, val);
      i += 1;
      continue;
    }

    if (a.startsWith("-")) {
      return { ...out, error: `Unknown option "${a}". Run "linux-doctor --help" for usage.` };
    }
    return { ...out, error: `Unexpected argument "${a}". Run "linux-doctor --help" for usage.` };
  }
  return out;
}
