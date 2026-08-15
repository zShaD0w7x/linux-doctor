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
import { startWeb } from "./web.js";

const CHECKS = [memory, load, disk, services, journal, suspend, security, updates, processes, battery, gpu];

export const HELP = `🩺 Linux Doctor — plain-English health checks for your Linux system.

USAGE
  linux-doctor [options]

OPTIONS
  --check <id>   run a single check (see list below)
  --json         print findings as JSON (machine-readable)
  --web          open the visual dashboard in your browser (recommended)
  --ai           add an AI summary in plain English (needs LLM_API_KEY)
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
    console.log("linux-doctor 0.1.0");
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

  const info = await systemInfo();
  const ctx = { run, osRelease: info.osRelease };

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

  const findings = (await collect()).findings;

  let summary = null;
  if (useAi) {
    summary = await aiSummary(findings);
  }

  if (jsonOut) {
    console.log(renderJson(findings));
    return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
  }

  console.log(await renderReport(findings, { aiSummary: summary }));
  return findings.some((f) => f.severity === "high" || f.severity === "medium") ? 1 : 0;
}
