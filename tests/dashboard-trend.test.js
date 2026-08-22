import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "src-gui", "index.html"), "utf8");

// Pull a top-level `function name(...) { ... }` out of the inline script by
// counting braces, so we can unit-test the pure chart builders without a DOM.
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, `function ${name} should exist in the dashboard script`);
  const braceStart = src.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

// Compile the three pure chart helpers together so scoreChart/severityChart
// can resolve fmtWhen. `new Function` only compiles — it does not run, so no
// DOM is touched; we then invoke the returned functions with sample data.
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const body = extractFn(script, "fmtWhen") + "\n" + extractFn(script, "scoreChart") + "\n" + extractFn(script, "severityChart") +
  "\nreturn { fmtWhen, scoreChart, severityChart };";
const { fmtWhen, scoreChart, severityChart } = new Function(body)();

const sample = [
  { at: "2026-08-20T10:00:00.000Z", score: 70, counts: { high: 1, medium: 2, info: 5 } },
  { at: "2026-08-21T10:00:00.000Z", score: 82, counts: { high: 0, medium: 1, info: 4 } },
  { at: "2026-08-22T10:00:00.000Z", score: 55, counts: { high: 3, medium: 2, info: 6 } },
];

test("fmtWhen: renders a compact date/time and tolerates bad input", () => {
  assert.match(fmtWhen("2026-08-21T10:05:00.000Z"), /^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/);
  assert.equal(fmtWhen("not-a-date"), "");
});

test("scoreChart: renders an SVG area+line with the score and direction", () => {
  // Range 45..82 crosses 50, so the attention threshold line should appear.
  const out = scoreChart([
    { at: "2026-08-20T10:00:00.000Z", score: 70 },
    { at: "2026-08-21T10:00:00.000Z", score: 82 },
    { at: "2026-08-22T10:00:00.000Z", score: 45 },
  ]);
  assert.ok(out.includes("<svg"), "produces an svg");
  assert.ok(out.includes("Health score"), "has the title");
  assert.ok(out.includes("polyline"), "draws the score line");
  assert.ok(out.includes("path"), "draws the area fill");
  assert.ok(out.includes("stroke-dasharray"), "shows the 50-point threshold line when crossed");
  assert.ok(out.includes("45/100"), "shows the latest score");
});

test("scoreChart: omits the threshold line when the range stays above 50", () => {
  const out = scoreChart([
    { at: "2026-08-20T10:00:00.000Z", score: 80 },
    { at: "2026-08-21T10:00:00.000Z", score: 90 },
  ]);
  assert.ok(!out.includes("stroke-dasharray"), "no threshold line when range is clear");
});

test("severityChart: renders one stacked bar per run with high/medium/info segments", () => {
  const out = severityChart(sample);
  assert.ok(out.includes("<svg"), "produces an svg");
  // Three runs => three info + three medium + three high rects = 9 rects.
  const rects = out.match(/<rect /g) || [];
  assert.equal(rects.length, 9);
  assert.ok(out.includes("var(--red)"), "high segments use red");
  assert.ok(out.includes("var(--yellow)"), "medium segments use yellow");
  assert.ok(out.includes("var(--blue)"), "info segments use blue");
  assert.ok(out.includes("high: 3"), "tooltip reports the high count");
  assert.ok(out.includes("sevlegend"), "renders the legend");
});

test("severityChart: handles a run with zero findings (no negative heights)", () => {
  const out = severityChart([
    { at: "2026-08-20T10:00:00.000Z", score: 100, counts: { high: 0, medium: 0, info: 0 } },
    { at: "2026-08-21T10:00:00.000Z", score: 90, counts: { high: 0, medium: 1, info: 2 } },
  ]);
  assert.ok(out.includes("<svg"));
  // No NaN/undefined leaked into coordinates.
  assert.ok(!out.includes("NaN"));
  assert.ok(!out.includes("undefined"));
});
