import { createRequire } from "node:module";
import { run } from "./utils.js";
import { memory } from "./checks/memory.js";
import { load } from "./checks/load.js";
import { disk } from "./checks/disk.js";
import { services } from "./checks/services.js";
import { journal } from "./checks/journal.js";
import { suspend } from "./checks/suspend.js";
import { security } from "./checks/security.js";
import { updates } from "./checks/updates.js";
import { processes } from "./checks/processes.js";
import { battery } from "./checks/battery.js";
import { gpu } from "./checks/gpu.js";
import { systemInfo } from "./checks/system.js";
import { renderReport, renderJson } from "./report.js";
import { aiSummary } from "./llm.js";
import { pushReport } from "./fleet.js";
import { startWeb } from "./web.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const CHECKS = [memory, load, disk, services, journal, suspend, security, updates, processes, battery, gpu];

export const HELP = `🩺 Linux Doctor — plain-English health checks for your Linux system.

USAGE
  linux-doctor [options]

OPTIONS
  --check <id>   run a single check (see list below)
  --json         print findings as JSON (machine-readable)
  --web          open the visual dashboard in your browser (recommended)
  --ai           add an AI summary in plain English (needs LLM_API_KEY)
  --push <url>   post the report to a fleet server (FLEET_API_KEY optional)
  --help         show this help
  --version      show the version

CHECKS
  ${CHECKS.map((c) => `${c.id} — ${c.title}`).join("\n  ")}

Linux Doctor is read-only: it inspects the system but never modifies anything.
`;

export async function main(argv) {
  const args = argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  if (args.includes("--version")) {
    console.log(`${pkg.name} ${pkg.version}`);
    return 0;
  }

  const jsonOut = args.includes("--json");
  const useAi = args.includes("--ai");
  const webOut = args.includes("--web");
  const checkFlag = args.includes("--check") ? args[args.indexOf("--check") + 1] : null;
  if (checkFlag && !CHECKS.some((c) => c.id === checkFlag)) {
    console.error(`Unknown check "${checkFlag}". Run with --help to list checks.`);
    return 2;
  }

  const pushUrl = args.includes("--push") ? args[args.indexOf("--push") + 1] : null;
  if (args.includes("--push") && !pushUrl) {
    console.error("--push requires a URL, e.g. --push https://your-server/reports");
    return 2;
  }

  const collect = async () => {
    const system = await systemInfo();
    const cctx = { run, osRelease: system.osRelease };
    const selected = checkFlag ? CHECKS.filter((c) => c.id === checkFlag) : CHECKS;
    const results = await Promise.all(selected.map((c) => c.run(cctx)));
    const findings = results.flat().map((f, i) => ({ id: i + 1, ...f }));
    return { generatedAt: new Date().toISOString(), system, findings };
  };

  if (webOut) {
    const server = await startWeb({ collect });
    await new Promise((resolve) => {
      const stop = () => { server.close(); resolve(0); };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    });
    return 0;
  }

  const { findings, system } = await collect();

  let summary = null;
  if (useAi) {
    summary = await aiSummary(findings);
  }

  if (pushUrl) {
    try {
      await pushReport(pushUrl, { system, findings, summary }, { apiKey: process.env.FLEET_API_KEY });
      console.error(`📡 Report sent to ${pushUrl}`);
    } catch (err) {
      console.error(`⚠️  Could not send report to fleet server: ${err.message}`);
      return 2;
    }
  }

  if (jsonOut) {
    console.log(renderJson(findings, system));
    return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
  }

  console.log(await renderReport(findings, { aiSummary: summary, system }));
  return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
}
