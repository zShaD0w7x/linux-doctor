/* === SVG charts: score sparkline + severity bars === */
function fmtWhen(at) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/* Tiny inline sparkline for the hero meta row — no axes, no dots, no
   interaction; the full charts live in the History section. */
function miniSpark(data) {
  const W = 90, H = 22, pad = 3;
  const scores = data.map((r) => r.score);
  if (scores.length < 2) return "";
  const min = Math.min(...scores), max = Math.max(...scores);
  const span = Math.max(1, max - min);
  const X = (i) => pad + (i * (W - 2 * pad)) / (scores.length - 1);
  const Y = (s) => H - pad - ((s - min) / span) * (H - 2 * pad);
  const line = scores.map((s, i) => X(i).toFixed(1) + "," + Y(s).toFixed(1)).join(" ");
  const color = scores[scores.length - 1] >= 80 ? "var(--green)" : scores[scores.length - 1] >= 50 ? "var(--yellow)" : "var(--red)";
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Score trend, last ' + scores.length + ' runs">' +
    '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function scoreChart(data) {
  const W = 260, H = 50, pad = 6;
  const scores = data.map((r) => r.score);
  const min = Math.min(...scores), max = Math.max(...scores);
  const span = Math.max(1, max - min);
  const X = (i) => pad + (i * (W - 2 * pad)) / (scores.length - 1);
  const Y = (s) => H - pad - ((s - min) / span) * (H - 2 * pad);
  const pts = scores.map((s, i) => [X(i).toFixed(1), Y(s).toFixed(1)]);
  const last = scores[scores.length - 1];
  const color = last >= 80 ? "var(--green)" : last >= 50 ? "var(--yellow)" : "var(--red)";
  const first = scores[0];
  const dir = last > first ? { txt: "\u25b2 Improving", cls: "delta-up" }
    : last < first ? { txt: "\u25bc Declining", cls: "delta-down" }
    : { txt: "\u25c6 Stable", cls: "delta-flat" };
  const range = min === max ? String(last) : min + " \u2192 " + last;
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = "M" + line.replace(/ /g, " L") + " L" + (W - pad) + "," + (H - pad) + " L" + pad + "," + (H - pad) + " Z";
  const dots = pts.map((p, i) =>
    '<circle data-idx="' + i + '" cx="' + p[0] + '" cy="' + p[1] + '" r="6" fill="transparent" style="cursor:pointer" class="hist-dot">' +
    '<title>' + scores[i] + "/100 \u00b7 " + fmtWhen(data[i].at) + ' \u2014 click to show diff</title></circle>').join("");
  const end = pts[pts.length - 1];
  const thresh = (min < 50 && max > 50)
    ? '<line x1="' + pad + '" y1="' + Y(50).toFixed(1) + '" x2="' + (W - pad) + '" y2="' + Y(50).toFixed(1) + '" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>'
    : "";
  return '<div class="trendchart">' +
    '<div class="trendtitle">Health score \u00b7 last ' + scores.length + ' run(s): <b>' + last + '/100</b>' +
    ' <span class="' + dir.cls + '">' + dir.txt + '</span> <span class="trendrange">(' + range + ')</span></div>' +
    '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Health score trend">' +
    thresh + '<path d="' + area + '" fill="' + color + '" opacity="0.18"/>' +
    '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    dots + '<circle cx="' + end[0] + '" cy="' + end[1] + '" r="3" fill="' + color + '"/></svg></div>';
}

function severityChart(data) {
  const W = 300, H = 72, spad = 8, sgap = 4;
  const counts = data.map((r) => ({
    high: (r.counts && r.counts.high) || 0,
    medium: (r.counts && r.counts.medium) || 0,
    info: (r.counts && r.counts.info) || 0,
    at: r.at,
  }));
  const maxTotal = Math.max(1, ...counts.map((c) => c.high + c.medium + c.info));
  const n = counts.length;
  const bw = (W - 2 * spad - (n - 1) * sgap) / n;
  const totalH = H - 2 * spad;
  const bars = counts.map((c, i) => {
    const x = (spad + i * (bw + sgap)).toFixed(1);
    const iH = totalH * c.info / maxTotal;
    const mH = totalH * c.medium / maxTotal;
    const hH = totalH * c.high / maxTotal;
    const yInfo = (H - spad - iH).toFixed(1);
    const yMed = (H - spad - iH - mH).toFixed(1);
    const yHigh = (H - spad - iH - mH - hH).toFixed(1);
    const tip = "high: " + c.high + " \u00b7 medium: " + c.medium + " \u00b7 info: " + c.info + (fmtWhen(c.at) ? " \u00b7 " + fmtWhen(c.at) : "");
    return '<g data-idx="' + i + '" style="cursor:pointer" class="hist-bar">' +
      '<rect x="' + x + '" y="' + yInfo + '" width="' + bw.toFixed(1) + '" height="' + iH.toFixed(1) + '" fill="var(--blue)" opacity="0.85"><title>' + tip + ' \u2014 click to show diff</title></rect>' +
      '<rect x="' + x + '" y="' + yMed + '" width="' + bw.toFixed(1) + '" height="' + mH.toFixed(1) + '" fill="var(--yellow)" opacity="0.9"><title>' + tip + '</title></rect>' +
      '<rect x="' + x + '" y="' + yHigh + '" width="' + bw.toFixed(1) + '" height="' + hH.toFixed(1) + '" fill="var(--red)" opacity="0.9"><title>' + tip + '</title></rect></g>';
  }).join("");
  return '<div class="trendchart">' +
    '<div class="trendtitle">Findings by severity \u00b7 last ' + n + ' run(s)</div>' +
    '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Severity counts over time">' + bars + '</svg>' +
    '<div class="sevlegend"><span class="lg high"></span>high <span class="lg medium"></span>medium <span class="lg info"></span>info</div>' +
    '</div>';
}
