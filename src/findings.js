import { slugify } from "./utils.js";
import { SEV_ORDER } from "./severities.js";

/**
 * Normalize the raw findings a check returns into the shape consumers rely on.
 * This is the single place that derives the stable `code`: an explicit code
 * wins, a dedupeKey is a stable root cause, and otherwise we slug the check id
 * and title. Applied BEFORE ignore filtering and dedupe (in cli.js) so
 * --ignore-code and history diffing see the same identity the report uses —
 * a finding must never gain its identity after the filters have already run.
 */
export function normalizeFindings(findings) {
  return findings.map((f) => ({
    ...f,
    code: f.code ?? f.dedupeKey ?? `${f.check}/${slugify(f.title)}`,
  }));
}

const CONFIDENCE = ["high", "medium", "low"];

/** Shape rules shared by the factory and the runtime validator. */
function validateFinding(f, errors) {
  if (!f || typeof f !== "object") {
    errors.push("not an object");
    return;
  }
  if (!SEV_ORDER.includes(f.severity)) errors.push(`severity ${JSON.stringify(f.severity)}`);
  if (typeof f.title !== "string" || f.title.trim() === "") errors.push("title missing");
  if (typeof f.code !== "string" || f.code.trim() === "") errors.push("code missing");
  if (f.fix !== undefined && f.fix !== null && typeof f.fix !== "string") errors.push("fix not a string");
  if (f.detail !== undefined && f.detail !== null && typeof f.detail !== "string") errors.push("detail not a string");
  if (f.evidence !== undefined && f.evidence !== null && typeof f.evidence !== "string") errors.push("evidence not a string");
  if (f.dedupeKey !== undefined && f.dedupeKey !== null && typeof f.dedupeKey !== "string") errors.push("dedupeKey not a string");
  if (f.confidence !== undefined && !CONFIDENCE.includes(f.confidence)) errors.push(`confidence ${JSON.stringify(f.confidence)}`);
}

/**
 * Build a finding with the documented shape (src/schema.js) and sane defaults.
 * Checks use this instead of hand-writing { severity, code, title, detail,
 * evidence, fix, confidence } inline, so a new check author cannot forget a
 * field or misspell a severity. Throws on an invalid shape — a bug in a check
 * should surface loudly at construction, and the pipeline records the throw
 * in checkErrors instead of letting a malformed finding pollute the report.
 * `check` is added by the pipeline, not here.
 */
export function finding({ severity, code, title, detail = null, evidence = null, fix = null, confidence = "high", dedupeKey }) {
  const f = {
    severity,
    code,
    title,
    detail,
    evidence,
    fix,
    confidence,
    ...(dedupeKey ? { dedupeKey } : {}),
  };
  const errors = [];
  validateFinding(f, errors);
  if (errors.length) throw new Error(`invalid finding (${errors.join(", ")}): ${title}`);
  return f;
}

/**
 * Validate the normalized findings against the documented shape (src/schema.js).
 * Used at runtime so a broken plugin — or a future bug in a check — is reported
 * to stderr and dropped instead of silently polluting the report. Never throws.
 * Returns [{ index, check, code, errors }] for the malformed findings.
 */
export function invalidFindings(findings) {
  const bad = [];
  findings.forEach((f, i) => {
    const errors = [];
    validateFinding(f, errors);
    if (errors.length) bad.push({ index: i, check: f?.check, code: f?.code, errors });
  });
  return bad;
}