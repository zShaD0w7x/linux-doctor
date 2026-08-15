import { lines } from "../utils.js";

/**
 * Messages that look scary but are routine noise on most distros.
 * We suppress them from the report so the doctor only surfaces what matters.
 */
const NOISE_PATTERNS = [
  /SELinux is preventing/i,
  /setroubleshoot/i,
  /Failed to resolve group/i,
  /Failed to resolve user/i,
  /Remote address changed/i,
  /All features that should not exist/i,
  /already exists and is not a directory/i,
  /Create-Printer-Subscriptions/i,
  /client-error-bad-request/i,
  /failed to retrieve rpm info/i,
  /busno=/i,
  /TDX not supported by the host platform/i,
];

const MEANINGFUL_PATTERNS = [
  /system-sleep.*failed/i,
  /pam_unix\([^)]*\):.*could not identify/i,
  /Authentication attempt too soon/i,
  /oom/i,
  /out of memory/i,
  /i\/o error/i,
  /read-only file system/i,
  /corrupt/i,
  /segfault/i,
  /kernel panic/i,
];

export const journal = {
  id: "journal",
  title: "System log errors (last 24 hours)",
  async run(ctx) {
    const findings = [];
    const res = await ctx.run(`journalctl -p err --since "-24 hours" --no-pager -o short 2>/dev/null`);
    if (!res.ok || !res.stdout.trim()) return findings;

    const noise = [];
    const meaningful = [];
    for (const l of lines(res.stdout)) {
      if (NOISE_PATTERNS.some((re) => re.test(l))) {
        noise.push(l);
        continue;
      }
      if (MEANINGFUL_PATTERNS.some((re) => re.test(l))) {
        meaningful.push(l);
        continue;
      }
      // Anything else at error level is worth a mention.
      meaningful.push(l);
    }

    if (meaningful.length > 0) {
      // Aggregate duplicates so 60 copies of the same message become one line.
      const counts = new Map();
      for (const l of meaningful) {
        const key = l.replace(/^[A-Z][a-z]{2} \d{2} \d{2}:\d{2}:\d{2} \S+ /, "").slice(0, 90);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([msg, count]) => `${msg}  (×${count})`);
      findings.push({
        severity: meaningful.length > 3 ? "medium" : "info",
        title: `${meaningful.length} noteworthy error(s) in the last 24 hours (${counts.size} unique)`,
        detail: "These log entries are not routine noise and may point to a real problem. The most common ones are listed below; use `journalctl -p err -b` to investigate.",
        evidence: top.join("\n"),
        fix: "Look up the exact message on your distro's docs or forums. For `system-sleep` failures, check the named suspend hook.",
        confidence: "medium",
      });
    }

    if (noise.length > 0 && meaningful.length === 0) {
      findings.push({
        severity: "info",
        title: "No significant errors — only routine noise",
        detail: `The last 24 hours of the error log contain only messages we recognize as normal on most systems (SELinux noise, udev messages, printer discovery, and similar). Nothing to worry about.`,
        evidence: `Filtered out ${noise.length} known-benign entries.`,
        fix: null,
        confidence: "high",
      });
    }
    return findings;
  },
};
