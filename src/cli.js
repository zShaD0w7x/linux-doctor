import { createRequire } from "node:module";
import { run, runPool, slugify } from "./utils.js";
import { checks as CHECKS } from "./checks/index.js";
import { systemInfo } from "./checks/system.js";
import { renderReport, renderJson, renderPlain } from "./report.js";
import { aiSummary } from "./llm.js";
import { pushReport } from "./fleet.js";
import { startWeb } from "./web.js";
import { score, loadHistory, diffSinceLast, saveRun } from "./history.js";
import { loadIgnore, isIgnored } from "./ignore.js";
import { loadConfig } from "./config.js";
import { loadThresholds } from "./thresholds.js";
import { detectDistro } from "./distro.js";
import { detectProfile } from "./profile.js";
import { dedupe } from "./dedupe.js";
import { parseArgs } from "./args.js";
import { reportSchema } from "./schema.js";
import { loadPlugins } from "./plugins.js";

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
  --json         print findings as JSON (machine-readable)
  --plain        print plain, tab-separated text (no colors/emoji; grep-friendly)
  --web          open the visual dashboard in your browser (recommended)
  --ai           add an AI summary in plain English (needs LLM_API_KEY)
  --push <url>   post the report to a fleet server (FLEET_API_KEY optional)
  --ignore <txt> hide findings whose title contains <txt> (see config file)
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
  if (args.schema) {
    console.log(JSON.stringify(reportSchema, null, 2));
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

  if (args.list) {
    const profile = await detectProfile();
    console.log(formatChecksForSystem(checks, profile));
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
    const ignoredCount = all.filter((f) => isIgnored(f.title, ignorePatterns)).length;
    const findings = dedupe(all.filter((f) => !isIgnored(f.title, ignorePatterns)))
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

    // Subset runs (--check) are not comparable to a full run — their findings
    // differ by construction — so they neither move the history forward nor
    // claim things are new or fixed. Full runs only.
    if (args.checkIds.length > 0) {
      return { ...data, score: sc, counts, newCount: 0, fixedCount: 0, diffSinceLast: { added: [], fixed: [] } };
    }

    const diff = diffSinceLast(data.findings, runs);
    if (save) {
      saveRun({
        at: new Date().toISOString(),
        score: sc,
        counts,
        findings: data.findings.map((f) => ({ severity: f.severity, title: f.title })),
      });
    }
    const addedTitles = new Set(diff.added.map((f) => f.title));
    return {
      ...data,
      score: sc,
      counts,
      newCount: diff.added.length,
      fixedCount: diff.fixed.length,
      diffSinceLast: diff,
      findings: data.findings.map((f) => ({ ...f, isNew: addedTitles.has(f.title) })),
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

  if (args.json) {
    console.log(renderJson(findings, system, {
      generatedAt: report.generatedAt,
      score: sc,
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
    let out = renderPlain(findings, { system, score: sc, newCount, fixedCount: report.fixedCount, ignoredCount: report.ignoredCount, checkErrors: report.checkErrors, checksRun: report.checksRun, checksSkipped: report.checksSkipped });
    if (args.profile) out += "\n" + formatPlainDurations(report.checkDurations);
    console.log(out);
    return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
  }

  let out = await renderReport(findings, { aiSummary: summary, system, score: sc, newCount, fixedCount: report.fixedCount, ignoredCount: report.ignoredCount, checkErrors: report.checkErrors, checksRun: report.checksRun, checksSkipped: report.checksSkipped });
  if (args.profile) out += "\n" + formatDurations(report.checkDurations);
  console.log(out);
  return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
}
