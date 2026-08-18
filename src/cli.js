import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { run, runPool, slugify, lines } from "./utils.js";
import { checks as CHECKS } from "./checks/index.js";
import { systemInfo } from "./checks/system.js";
import { renderReport, renderJson, renderPlain, renderTodo, SEV_ORDER } from "./report.js";
import { aiSummary } from "./llm.js";
import { pushReport } from "./fleet.js";
import { startWeb } from "./web.js";
import { score, loadHistory, diffSinceLast, saveRun, previousScore } from "./history.js";
import { loadIgnore, loadIgnoreCodes, isIgnored, isCodeIgnored } from "./ignore.js";
import { loadConfig } from "./config.js";
import { loadThresholds } from "./thresholds.js";
import { detectDistro } from "./distro.js";
import { detectProfile } from "./profile.js";
import { dedupe } from "./dedupe.js";
import { parseArgs } from "./args.js";
import { reportSchema } from "./schema.js";
import { loadPlugins } from "./plugins.js";
import { configFile } from "./config.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// How many checks may run at once. Checks spawn subprocesses internally, so
// an unbounded Promise.all over 26 checks would launch dozens of commands
// simultaneously; 4 keeps a full run fast without hammering the machine.
const RUN_CONCURRENCY = 4;

/** Group checks by category, preserving first-appearance order. */
function groupByCategory(checks) {
  const groups = new Map();
  for (const c of checks) {
    if (!groups.has(c.category)) groups.set(c.category, []);
    groups.get(c.category).push(c);
  }
  return groups;
}

/** "category\n  id — title" blocks, used by --help and --list. */
function formatChecks(checks) {
  const lines = [];
  for (const [cat, list] of groupByCategory(checks)) {
    lines.push(`${cat}`);
    for (const c of list) lines.push(`  ${c.id} — ${c.title}`);
  }
  return lines.join("\n");
}

/** Like formatChecks, but marks checks that do not apply to this machine. */
function formatChecksForSystem(checks, profile) {
  const lines = [];
  for (const [cat, list] of groupByCategory(checks)) {
    lines.push(`${cat}`);
    for (const c of list) {
      const applies = c.appliesTo.includes(profile.kind);
      lines.push(`  ${c.id} — ${c.title}${applies ? "" : `  (n/a on ${profile.kind})`}`);
    }
  }
  return lines.join("\n");
}

/** --self-test: explain the environment — distro, profile, tools, and which
 * checks will actually run (and why others will not). Read-only, no run. */
async function runSelfTest(checks) {
  const [system, profile] = await Promise.all([systemInfo(), detectProfile()]);
  const out = [];
  out.push("# linux-doctor --self-test");
  out.push("");
  out.push(`Distro: ${system.distro} (family: ${system.family}${system.imageBased ? ", image-based: yes" : ""})`);
  out.push(`Profile: ${profile.kind}`);
  out.push(`Kernel: ${system.kernel} · ${system.cores} core(s) · up ${system.uptime}`);

  const toolsRes = await run(
    "for t in systemctl journalctl coredumpctl loginctl timedatectl lspci lsblk smartctl free nproc glxinfo pactl ip nft podman docker dnf apt pacman zypper rpm-ostree borg restic; do command -v \"$t\" 2>/dev/null; done"
  );
  const present = lines(toolsRes.stdout).map((p) => p.split("/").pop()).filter(Boolean);
  out.push(`Tools present: ${present.length > 0 ? present.join(", ") : "(none found)"}`);
  out.push("");

  const willRun = [];
  const skipped = [];
  for (const c of checks) {
    (c.appliesTo.includes(profile.kind) ? willRun : skipped).push(c);
  }
  out.push(`Checks: ${willRun.length} will run here, ${skipped.length} will not.`);
  out.push("");
  if (skipped.length > 0) {
    out.push("Checks that will NOT run on this machine:");
    for (const c of skipped) out.push(`  ${c.id} — ${c.title} (applies to ${c.appliesTo.join("/")})`);
    out.push("");
  }
  out.push(`Checks that will run:\n  ${willRun.map((c) => c.id).join(", ")}`);
  return out.join("\n");
}

/** Starter config with commented thresholds — written by --init-config. */
function starterConfig() {
  return JSON.stringify({
    // Hide findings whose title contains this text (case-insensitive substring match).
    ignore: [],
    // Hide findings by stable code (exact match, e.g. "services/failed").
    ignoreCodes: [],
    // Severity thresholds — override defaults. Remove lines to keep defaults.
    thresholds: {
      diskFullPct: 90,       // disk: percent used at which a partition is flagged
      diskWarnPct: 80,       // disk: percent used for a warning
      memLowRatio: 0.15,     // memory: available/total below which it's flagged
      memWarnRatio: 0.25,    // memory: available/total for warning
      loadWarnRatio: 0.7,    // load: 1-min average / cores for warning
      loadHighRatio: 1.0,    // load: 1-min average / cores for high
      loadCriticalRatio: 1.5,// load: 1-min average / cores for critical
      tempWarnC: 85,         // thermal: CPU temp in °C for warning
      tempHotC: 95,          // thermal: CPU temp in °C for high
      procWarnRatio: 0.2,    // processes: single app RSS / total RAM for warning
      procHighRatio: 0.4,    // processes: single app RSS / total RAM for high
      journalWarnBytes: 2147483648, // journald: journal size in bytes for warning (2 GB)
      containerWarnGB: 20,   // containerdisk: image storage in GB for warning
      containerHighGB: 50,   // containerdisk: image storage in GB for high
    },
  }, null, 2) + "\n";
}

/**
 * --compare: show what changed between a previous report and the current run.
 * The previous report is the JSON file passed as the argument; the current
 * report is what a fresh run produces. Differences are grouped by severity.
 */
async function runCompare(previous) {
  const [system, profile] = await Promise.all([systemInfo(), detectProfile()]);
  const config = loadConfig();
  const thresholds = loadThresholds(config);
  const cctx = { run, osRelease: system.osRelease, dist: detectDistro(system.osRelease), thresholds, profile };
  const selected = applicableChecks([], profile.kind);
  const results = await runPool(selected, RUN_CONCURRENCY, async (c) => {
    try {
      return (await c.run(cctx)).map((f) => ({ ...f, check: c.id }));
    } catch {
      return [];
    }
  });
  const all = results.flat();
  const current = dedupe(all).map((f, i) => ({
    id: i + 1, ...f,
    code: f.code ?? f.dedupeKey ?? `${f.check}/${slugify(f.title)}`,
  }));

  const prevCodes = new Set((previous.findings || []).map((f) => f.code));
  const curCodes = new Set(current.map((f) => f.code));
  const added = current.filter((f) => !prevCodes.has(f.code));
  const fixed = (previous.findings || []).filter((f) => !curCodes.has(f.code));

  if (added.length === 0 && fixed.length === 0) {
    console.log("No changes since the previous report.");
    return 0;
  }

  const out = [];
  if (added.length > 0) {
    out.push(`🔴 ${added.length} new finding(s):`);
    for (const f of added) out.push(`   [${f.severity}] ${f.title}`);
  }
  if (fixed.length > 0) {
    out.push(`🟢 ${fixed.length} fixed finding(s):`);
    for (const f of fixed) out.push(`   [${f.severity}] ${f.title}`);
  }
  console.log(out.join("\n"));
  return added.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
}

/**
 * Which checks run. An explicit --check list always wins (user intent); a
 * full run skips checks whose appliesTo does not include the machine kind
 * (e.g. the battery check on a desktop). `checks` defaults to the built-in
 * registry; callers with plugins pass the merged list.
 */
export function applicableChecks(checkIds, kind, checks = CHECKS) {
  const base = checkIds.length ? checks.filter((c) => checkIds.includes(c.id)) : checks;
  return checkIds.length ? base : base.filter((c) => c.appliesTo.includes(kind));
}

/** "⏱ Check durations" section for --profile (text output). */
function formatDurations(durations) {
  const sorted = [...durations].sort((a, b) => b.ms - a.ms);
  const lines = ["", "⏱ Check durations:"];
  for (const d of sorted) lines.push(`  ${d.check.padEnd(16)} ${d.ms}ms`);
  return lines.join("\n");
}

/** "# duration: <id> <ms>ms" rows for --profile --plain. */
function formatPlainDurations(durations) {
  return [...durations].sort((a, b) => b.ms - a.ms).map((d) => `# duration: ${d.check} ${d.ms}ms`).join("\n");
}

export const HELP = `🩺 Linux Doctor — plain-English health checks for your Linux system.

USAGE
  linux-doctor [options]

OPTIONS
  --check <id>   run only the given check(s), comma-separated or repeated
  --list         list the checks without running them
  --check-list   list checks as JSON (id, title, category, appliesTo)
  --json         print findings as JSON (machine-readable)
  --plain        print plain, tab-separated text (no colors/emoji; grep-friendly)
  --summary      one-liner: score + severity counts (for cron/scripts)
  --todo         numbered, copy-pasteable list of what to run, in order
  --self-test    explain the environment: distro, profile, which checks run
  --web          open the visual dashboard in your browser (recommended)
  --ai           add an AI summary in plain English (needs LLM_API_KEY)
  --html <path>  save a standalone HTML report (open in any browser)
  --compare <f>  diff a previous JSON report against the current run
  --push <url>   post the report to a fleet server (FLEET_API_KEY optional)
  --severity <s> show only findings at this severity (high, medium, info)
  --ignore <txt> hide findings whose title contains <txt>
  --ignore-code <c> hide findings by stable code (e.g. services/failed)
  --ignore-list  show configured ignore patterns and exit
  --init-config  create a starter config file at ~/.config/linux-doctor/config.json
  --help         show this help
  --version      show the version

CHECKS (grouped by category)
${formatChecks(CHECKS)}

Linux Doctor is read-only: it inspects the system but never modifies anything.
`;

export async function main(argv) {
  const args = parseArgs(argv);

  if (args.error) {
    console.error(`linux-doctor: ${args.error}`);
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args.version) {
    console.log(`${pkg.name} ${pkg.version}`);
    return 0;
  }
  if (args.severity && !SEV_ORDER.includes(args.severity)) {
    console.error(`linux-doctor: --severity must be one of: high, medium, info (got "${args.severity}")`);
    return 2;
  }

  // --init-config: create a starter config file and exit.
  if (args.initConfig) {
    const file = configFile();
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, starterConfig(), "utf8");
      console.log(`Config written to ${file}`);
    } catch (err) {
      console.error(`linux-doctor: could not write config: ${err.message}`);
      return 2;
    }
    return 0;
  }

  // --compare: diff two JSON report files and exit.
  if (args.comparePath) {
    try {
      const other = JSON.parse(readFileSync(args.comparePath, "utf8"));
      return await runCompare(other);
    } catch (err) {
      console.error(`linux-doctor: could not read compare file: ${err.message}`);
      return 2;
    }
  }

  if (args.schema) {
    console.log(JSON.stringify(reportSchema, null, 2));
    return 0;
  }

  // --ignore-list: show configured ignore patterns and exit.
  if (args.ignoreList) {
    const titlePatterns = loadIgnore();
    const codePatterns = loadIgnoreCodes();
    if (titlePatterns.length === 0 && codePatterns.length === 0) {
      console.log("No ignore patterns configured.");
    } else {
      if (titlePatterns.length > 0) {
        console.log("Title patterns:");
        for (const p of titlePatterns) console.log(`  - ${p}`);
      }
      if (codePatterns.length > 0) {
        console.log("Code patterns:");
        for (const c of codePatterns) console.log(`  - ${c}`);
      }
    }
    return 0;
  }

  // Plugins are user-provided checks from ~/.config/linux-doctor/checks/ (or
  // $LINUX_DOCTOR_PLUGINS). A broken or colliding plugin is skipped with a
  // warning — it must never take down a run.
  const builtinIds = new Set(CHECKS.map((c) => c.id));
  const plugins = (await loadPlugins()).filter((p) => {
    if (builtinIds.has(p.id)) {
      console.error(`linux-doctor: plugin "${p.id}" collides with a built-in check — skipping`);
      return false;
    }
    return true;
  });
  const checks = [...CHECKS, ...plugins];

  // --check-list: print check metadata as JSON and exit.
  if (args.checkList) {
    const profile = await detectProfile();
    const list = checks.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      appliesTo: c.appliesTo,
      appliesHere: c.appliesTo.includes(profile.kind),
    }));
    console.log(JSON.stringify(list, null, 2));
    return 0;
  }

  if (args.list) {
    const profile = await detectProfile();
    console.log(formatChecksForSystem(checks, profile));
    return 0;
  }

  if (args.selfTest) {
    console.log(await runSelfTest(checks));
    return 0;
  }

  const unknown = args.checkIds.find((id) => !checks.some((c) => c.id === id));
  if (unknown) {
    console.error(`Unknown check "${unknown}". Run with --help to list checks.`);
    return 2;
  }

  // --ignore <text> adds a pattern for this run only; the config file
  // (~/.config/linux-doctor/config.json) holds the persistent list.
  const config = loadConfig();
  const ignorePatterns = [...loadIgnore(), ...args.ignore];
  const ignoreCodes = [...loadIgnoreCodes(), ...args.ignoreCodes];
  const thresholds = loadThresholds(config);

  const collect = async () => {
    const [system, profile] = await Promise.all([systemInfo(), detectProfile()]);
    const cctx = { run, osRelease: system.osRelease, dist: detectDistro(system.osRelease), thresholds, profile };
    const selected = applicableChecks(args.checkIds, profile.kind, checks);
    const checkDurations = [];
    const checkErrors = [];
    const results = await runPool(selected, RUN_CONCURRENCY, async (c) => {
      const t0 = Date.now();
      // A check that throws must never take down the whole report: it is
      // recorded in checkErrors and the run continues without it.
      try {
        const out = (await c.run(cctx)).map((f) => ({ ...f, check: c.id }));
        checkDurations.push({ check: c.id, ms: Date.now() - t0 });
        return out;
      } catch (err) {
        checkErrors.push({ check: c.id, error: err && err.message ? err.message : String(err) });
        checkDurations.push({ check: c.id, ms: Date.now() - t0 });
        return [];
      }
    });
    const all = results.flat();
    // Ignore first (user intent wins), then collapse findings that report the
    // same root cause (e.g. software rendering is detected by both the gpu
    // and wayland checks) so one problem never counts twice. `code` is a
    // stable machine key per finding: an explicit one wins, otherwise the
    // dedupeKey (stable root cause) or a slug of check id + title.
    const ignoredCount = all.filter((f) => isIgnored(f.title, ignorePatterns) || isCodeIgnored(f.code, ignoreCodes)).length;
    const findings = dedupe(all.filter((f) => !isIgnored(f.title, ignorePatterns) && !isCodeIgnored(f.code, ignoreCodes)))
      .map((f, i) => ({
        id: i + 1,
        ...f,
        code: f.code ?? f.dedupeKey ?? `${f.check}/${slugify(f.title)}`,
      }));
    // Tell the user when an ignore pattern is stale — a silent no-op means
    // the pattern will rot unnoticed as finding titles change. Skipped in web
    // mode: the dashboard re-runs checks constantly and would spam the log.
    if (!args.web) {
      for (const p of new Set(ignorePatterns)) {
        if (!all.some((f) => isIgnored(f.title, [p]))) {
          console.error(`linux-doctor: ignore pattern "${p}" matched nothing — finding titles may have changed`);
        }
      }
    }
    // Transparency: how many checks actually ran, and how many were skipped
    // by appliesTo gating (full runs only). A report with zero findings means
    // "no problems", not "nothing ran" — these numbers say which it was.
    const checksRun = selected.length;
    const checksSkipped = args.checkIds.length ? 0 : checks.length - selected.length;
    return { generatedAt: new Date().toISOString(), system: { ...system, kind: profile.kind }, findings, checkDurations, checkErrors, ignoredCount, checksRun, checksSkipped };
  };

  // Attach health score, severity counts, and "new since last check" flags.
  // In web mode we do NOT save a history entry (the dashboard may re-run the
  // checks many times; only CLI/desktop runs move the history forward).
  const attachHistory = (data, { save = true } = {}) => {
    const runs = loadHistory();
    const counts = { high: 0, medium: 0, info: 0 };
    for (const f of data.findings) if (f.severity in counts) counts[f.severity] += 1;
    const sc = score(data.findings);
    const prevSc = previousScore(runs);
    const scoreDelta = typeof sc === "number" && typeof prevSc === "number" ? sc - prevSc : null;

    // Subset runs (--check) are not comparable to a full run — their findings
    // differ by construction — so they neither move the history forward nor
    // claim things are new or fixed. Full runs only.
    if (args.checkIds.length > 0) {
      return { ...data, score: sc, scoreDelta: null, previousScore: null, counts, newCount: 0, fixedCount: 0, diffSinceLast: { added: [], fixed: [] } };
    }

    const diff = diffSinceLast(data.findings, runs);
    if (save) {
      saveRun({
        at: new Date().toISOString(),
        score: sc,
        counts,
        findings: data.findings.map((f) => ({ code: f.code, severity: f.severity, title: f.title })),
      });
    }
    // Match by stable code, not title — volatile titles ("3 services failed"
    // vs "2 services failed") must not churn the new/fixed markers.
    const addedKeys = new Set(diff.added.map((f) => f.code));
    return {
      ...data,
      score: sc,
      scoreDelta,
      previousScore: prevSc,
      counts,
      newCount: diff.added.length,
      fixedCount: diff.fixed.length,
      diffSinceLast: diff,
      findings: data.findings.map((f) => ({ ...f, isNew: addedKeys.has(f.code) })),
    };
  };

  if (args.web) {
    const server = await startWeb({
      collect: async () => attachHistory(await collect(), { save: false }),
      history: loadHistory,
      // The dashboard endpoint serves the same versioned payload as --json,
      // so scripts that read /api/report get schemaVersion/tool/version too.
      render: (data) => renderJson(data.findings, data.system, {
        generatedAt: data.generatedAt,
        score: data.score,
        newCount: data.newCount,
        fixedCount: data.fixedCount,
        diffSinceLast: data.diffSinceLast,
        counts: data.counts,
      }),
    });
    await new Promise((resolve) => {
      const stop = () => { server.close(); resolve(0); };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    });
    return 0;
  }

  const t0 = Date.now();
  const report = attachHistory(await collect());
  const durationMs = Date.now() - t0;
  const { findings, system, score: sc, newCount } = report;

  // --summary: one-liner for cron/scripts — score + counts, no findings.
  if (args.summary) {
    const { high, medium, info } = report.counts;
    const parts = [`score=${sc}`];
    if (typeof report.scoreDelta === "number") {
      parts.push(report.scoreDelta > 0 ? `delta=+${report.scoreDelta}` : `delta=${report.scoreDelta}`);
    }
    if (high > 0) parts.push(`high=${high}`);
    if (medium > 0) parts.push(`medium=${medium}`);
    if (info > 0) parts.push(`info=${info}`);
    if (newCount > 0) parts.push(`new=${newCount}`);
    console.log(parts.join(" "));
    return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
  }

  // --todo: just the fix steps, numbered, in priority order.
  if (args.todo) {
    console.log(renderTodo(findings));
    return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
  }

  // --severity filters what is DISPLAYED but does not affect scoring or
  // fleet push — the score and --push reflect the full picture.
  const displayFindings = args.severity
    ? findings.filter((f) => f.severity === args.severity)
    : findings;

  let summary = null;
  if (args.ai) {
    summary = await aiSummary(findings);
  }

  if (args.pushUrl) {
    try {
      await pushReport(args.pushUrl, {
        system,
        findings,
        summary,
        score: sc,
        newCount,
        fixedCount: report.fixedCount,
        diffSinceLast: report.diffSinceLast,
      }, { apiKey: process.env.FLEET_API_KEY });
      console.error(`📡 Report sent to ${args.pushUrl}`);
    } catch (err) {
      console.error(`⚠️  Could not send report to fleet server: ${err.message}`);
      return 2;
    }
  }

  if (args.htmlPath) {
    try {
      const jsonPayload = renderJson(findings, system, {
        generatedAt: report.generatedAt,
        score: sc,
        scoreDelta: report.scoreDelta,
        previousScore: report.previousScore,
        newCount,
        fixedCount: report.fixedCount,
        diffSinceLast: report.diffSinceLast,
        counts: report.counts,
        durationMs,
        checkErrors: report.checkErrors,
        ignoredCount: report.ignoredCount,
        checksRun: report.checksRun,
        checksSkipped: report.checksSkipped,
      });
      const dashboard = readFileSync(new URL("../src-gui/index.html", import.meta.url), "utf8");
      const html = `<script>\nconst __DATA__ = ${jsonPayload};\nwindow.fetch = async (url) => ({ ok: true, json: async () => __DATA__, text: async () => JSON.stringify(__DATA__) });\n</script>\n${dashboard}`;
      writeFileSync(args.htmlPath, html, "utf8");
      console.error(`📄 Report saved to ${args.htmlPath}`);
    } catch (err) {
      console.error(`⚠️  Could not write HTML report: ${err.message}`);
      return 2;
    }
    return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
  }

  if (args.json) {
    console.log(renderJson(displayFindings, system, {
      generatedAt: report.generatedAt,
      score: sc,
      scoreDelta: report.scoreDelta,
      previousScore: report.previousScore,
      newCount,
      fixedCount: report.fixedCount,
      diffSinceLast: report.diffSinceLast,
      counts: report.counts,
      durationMs,
      checkErrors: report.checkErrors,
      ignoredCount: report.ignoredCount,
      checksRun: report.checksRun,
      checksSkipped: report.checksSkipped,
      ...(args.profile ? { durations: report.checkDurations } : {}),
    }));
    return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
  }

  if (args.plain) {
    let out = renderPlain(displayFindings, { system, score: sc, scoreDelta: report.scoreDelta, newCount, fixedCount: report.fixedCount, ignoredCount: report.ignoredCount, checkErrors: report.checkErrors, checksRun: report.checksRun, checksSkipped: report.checksSkipped });
    if (args.profile) out += "\n" + formatPlainDurations(report.checkDurations);
    console.log(out);
    return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
  }

  let out = await renderReport(displayFindings, { aiSummary: summary, system, score: sc, newCount, fixedCount: report.fixedCount, ignoredCount: report.ignoredCount, checkErrors: report.checkErrors, checksRun: report.checksRun, checksSkipped: report.checksSkipped });
  if (args.profile) out += "\n" + formatDurations(report.checkDurations);
  console.log(out);
  return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
}

// NOTE: exit code always reflects the FULL finding set (not the --severity
// filter), so `--severity info` on a system with a high finding still exits 1.