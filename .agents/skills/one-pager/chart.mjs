#!/usr/bin/env node
// Render data charts in a page to inline SVG, so the page needs no JavaScript
// and no network. Pure Node: no browser needed.
//
//   node chart.mjs <file.html>
//
// Finds each <pre class="chart">{ JSON spec }</pre> and replaces it with
//   <figure class="chart" data-chart="…spec…"><svg>…</svg><figcaption>…</figcaption>
//   <details class="chart-data">…table…</details></figure>
// Already-rendered figures are re-rendered from data-chart, so re-running is
// safe. Marks use CSS classes from the page's stylesheet, so charts follow
// light, dark, and print modes.
//
// Spec:
//   {
//     "type": "bar" | "line",
//     "title": "Round trips add up fast",     // the takeaway, shown in the caption
//     "labels": ["100 km", "1,000 km", …],    // bar categories, or line x values in order
//     "series": [{ "name": "Round trip", "values": [1, 10, …] }],  // 1 or 2 series
//     "unit": "ms",                           // optional, appended to values
//     "source": "Light in fibre ≈ 200,000 km/s", // optional, shown after the title
//     "width": "column" | "half" | "full",    // optional: wide column (default), half of a
//                                             // "row even", or full page width
//     "yMin": 0                               // optional, line charts only
//   }

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('usage: node chart.mjs <file.html>');
  process.exit(2);
}

const WIDTHS = { column: 430, half: 350, full: 730 }; // CSS px at print size
const CHAR = 6.1; // average glyph width at 11px, for label layout
const DIGIT = 6.9; // width of a bold tabular digit or comma at 11px, for value labels

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const r1 = (n) => Math.round(n * 10) / 10;

function niceStep(range, count) {
  const raw = range / Math.max(count, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}
function ticks(min, max, count = 4) {
  const step = niceStep(max - min || 1, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

function validate(spec, n) {
  const errs = [];
  if (!['bar', 'line'].includes(spec.type)) errs.push('type must be "bar" or "line"');
  if (!spec.title) errs.push('title is required (state the takeaway)');
  if (!Array.isArray(spec.labels) || spec.labels.length < 2) errs.push('labels needs at least 2 entries');
  if (!Array.isArray(spec.series) || spec.series.length < 1 || spec.series.length > 2)
    errs.push('series needs 1 or 2 entries (the palette has two series colours)');
  for (const s of spec.series ?? []) {
    if (!s.name) errs.push('every series needs a name');
    if (!Array.isArray(s.values) || s.values.length !== spec.labels?.length)
      errs.push(`series "${s.name}" needs exactly one value per label`);
    else if (s.values.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
      errs.push(`series "${s.name}" has a non-numeric value`);
  }
  if (spec.type === 'bar' && spec.labels?.length > 8) errs.push('bar charts take at most 8 bars per series');
  if (spec.type === 'line' && spec.labels?.length > 12) errs.push('line charts take at most 12 points');
  if (spec.width && !WIDTHS[spec.width]) errs.push('width must be "column", "half" or "full"');
  if (errs.length) throw new Error(`chart ${n}: ${errs.join('; ')}`);
}

function renderChart(spec) {
  const W = WIDTHS[spec.width ?? 'column'];
  const unit = spec.unit ?? '';
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  const fmt = (v) => nf.format(v) + (unit ? (/^[%°]/.test(unit) ? unit : ` ${unit}`) : '');
  const many = spec.series.length > 1;
  const parts = [];
  let H;
  let top = 0;

  // Legend for two series: swatch + name, in ink.
  if (many) {
    let x = 0;
    spec.series.forEach((s, i) => {
      parts.push(`<rect class="s${i + 1}" x="${x}" y="2" width="10" height="10" rx="2"/>`);
      parts.push(`<text class="t" x="${x + 15}" y="11">${esc(s.name)}</text>`);
      x += 15 + s.name.length * CHAR + 18;
    });
    top = 24;
  }

  if (spec.type === 'bar') {
    // Horizontal bars: category labels left, values at the bar ends.
    const n = spec.series.length;
    const barH = n === 1 ? 16 : 11;
    const groupH = n * barH + (n - 1) * 2;
    const gap = 9;
    const labelW = Math.min(Math.max(...spec.labels.map((l) => String(l).length)) * CHAR + 10, W * 0.38);
    const all = spec.series.flatMap((s) => s.values);
    const max = Math.max(...all, 0);
    const valueW = Math.max(...all.map((v) => fmt(v).length)) * DIGIT + 12;
    const x0 = labelW;
    const plotW = W - labelW - valueW;
    const sx = (v) => (max > 0 ? (Math.max(v, 0) / max) * plotW : 0);
    spec.labels.forEach((label, i) => {
      const gy = top + i * (groupH + gap);
      parts.push(`<text class="t" x="${r1(labelW - 8)}" y="${r1(gy + groupH / 2 + 4)}" text-anchor="end">${esc(label)}</text>`);
      spec.series.forEach((s, j) => {
        const y = gy + j * (barH + 2);
        const w = sx(s.values[i]);
        const r = Math.min(4, w / 2, barH / 2);
        const x1 = x0 + w;
        // Square at the baseline, rounded at the data end.
        const d = w <= 0
          ? `M${x0},${y}h1v${barH}h-1z`
          : `M${r1(x0)},${r1(y)}H${r1(x1 - r)}Q${r1(x1)},${r1(y)} ${r1(x1)},${r1(y + r)}V${r1(y + barH - r)}Q${r1(x1)},${r1(y + barH)} ${r1(x1 - r)},${r1(y + barH)}H${r1(x0)}Z`;
        parts.push(`<path class="s${j + 1}" d="${d}"><title>${esc(`${label} · ${s.name}: ${fmt(s.values[i])}`)}</title></path>`);
        parts.push(`<text class="tv" x="${r1(x1 + 6)}" y="${r1(y + barH / 2 + 4)}">${esc(fmt(s.values[i]))}</text>`);
      });
    });
    H = top + spec.labels.length * (groupH + gap) - gap;
    parts.push(`<line class="base" x1="${x0}" x2="${x0}" y1="${top - 3}" y2="${r1(H + 3)}"/>`);
    H += 4;
  } else {
    // Line: y axis with a few recessive gridlines, x labels below, end labels right.
    const all = spec.series.flatMap((s) => s.values);
    const tk = ticks(spec.yMin ?? Math.min(0, ...all), Math.max(...all));
    const lo = tk[0];
    const hi = tk[tk.length - 1];
    const axisW = Math.max(...tk.map((v) => nf.format(v).length)) * CHAR + 8;
    const endW = Math.max(...spec.series.map((s) => Math.max(s.name.length * CHAR, fmt(s.values.at(-1)).length * DIGIT))) + 14;
    const plotH = 150;
    const x0 = axisW;
    const plotW = W - axisW - endW;
    const y0 = top + 6;
    const sx = (i) => x0 + (spec.labels.length === 1 ? 0 : (i / (spec.labels.length - 1)) * plotW);
    const sy = (v) => y0 + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    for (const v of tk) {
      parts.push(`<line class="${v === lo ? 'base' : 'grid'}" x1="${x0}" x2="${r1(x0 + plotW)}" y1="${r1(sy(v))}" y2="${r1(sy(v))}"/>`);
      parts.push(`<text class="tm" x="${r1(x0 - 6)}" y="${r1(sy(v) + 3.5)}" text-anchor="end">${esc(nf.format(v))}</text>`);
    }
    // Thin out x labels so they never collide.
    const maxLabel = Math.max(...spec.labels.map((l) => String(l).length)) * CHAR + 8;
    const every = Math.max(1, Math.ceil(maxLabel / (plotW / Math.max(spec.labels.length - 1, 1))));
    // Always show the first and last; drop a thinned label that would crowd the last.
    const last = spec.labels.length - 1;
    const shown = spec.labels.map((_, i) => i).filter((i) => i % every === 0);
    if (shown.at(-1) !== last) {
      if (last - shown.at(-1) < every) shown.pop();
      shown.push(last);
    }
    for (const i of shown) {
      parts.push(`<text class="tm" x="${r1(sx(i))}" y="${r1(y0 + plotH + 15)}" text-anchor="middle">${esc(spec.labels[i])}</text>`);
    }
    // End labels: name and last value, nudged apart if they collide.
    const ends = spec.series.map((s, j) => ({ j, y: sy(s.values.at(-1)) }));
    if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 26) {
      const [a, b] = ends[0].y <= ends[1].y ? [ends[0], ends[1]] : [ends[1], ends[0]];
      const mid = (a.y + b.y) / 2;
      a.y = mid - 13;
      b.y = mid + 13;
    }
    spec.series.forEach((s, j) => {
      const pts = s.values.map((v, i) => `${r1(sx(i))},${r1(sy(v))}`);
      parts.push(`<polyline class="l${j + 1}" points="${pts.join(' ')}"/>`);
      if (s.values.length <= 12) {
        s.values.forEach((v, i) => {
          parts.push(
            `<circle class="s${j + 1} ring" cx="${r1(sx(i))}" cy="${r1(sy(v))}" r="4"><title>${esc(`${spec.labels[i]} · ${s.name}: ${fmt(v)}`)}</title></circle>`,
          );
        });
      }
      const ey = ends.find((e) => e.j === j).y;
      const ex = r1(sx(s.values.length - 1) + 9);
      parts.push(`<text class="tv" x="${ex}" y="${r1(ey - 1)}">${esc(fmt(s.values.at(-1)))}</text>`);
      if (many) parts.push(`<text class="tm" x="${ex}" y="${r1(ey + 11)}">${esc(s.name)}</text>`);
    });
    H = y0 + plotH + 20;
  }

  const svg = `<svg viewBox="0 0 ${W} ${r1(H)}" role="img" aria-label="${esc(spec.title)}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  const caption = `<figcaption><strong>${esc(spec.title)}</strong>${spec.source ? ` ${esc(spec.source)}` : ''}</figcaption>`;
  const head = `<tr><th></th>${spec.series.map((s) => `<th>${esc(s.name)}${unit ? ` (${esc(unit)})` : ''}</th>`).join('')}</tr>`;
  const rows = spec.labels
    .map((l, i) => `<tr><td>${esc(l)}</td>${spec.series.map((s) => `<td>${esc(nf.format(s.values[i]))}</td>`).join('')}</tr>`)
    .join('');
  const table = `<details class="chart-data"><summary>Data</summary><table><thead>${head}</thead>${rows}</table></details>`;
  return svg + caption + table;
}

let html = readFileSync(file, 'utf8');
const pattern = /<pre class="chart">([\s\S]*?)<\/pre>|<figure class="chart" data-chart="([^"]*)">[\s\S]*?<\/details><\/figure>/g;
const blocks = [...html.matchAll(pattern)];
if (blocks.length === 0) {
  console.log(`${file}: no charts`);
  process.exit(0);
}

let failed = 0;
const out = blocks.map((m, i) => {
  try {
    const source = unesc(m[1] ?? m[2]).trim();
    let spec;
    try {
      spec = JSON.parse(source);
    } catch (e) {
      throw new Error(`chart ${i + 1}: spec is not valid JSON (${e.message})`);
    }
    validate(spec, i + 1);
    return `<figure class="chart" data-chart="${esc(JSON.stringify(spec))}">${renderChart(spec)}</figure>`;
  } catch (e) {
    failed++;
    console.error(`  FAIL ${e.message}`);
    return null;
  }
});

if (failed) {
  console.error(`${file}: ${failed} of ${blocks.length} chart(s) failed; page not changed`);
  process.exit(1);
}
blocks.forEach((m, i) => {
  html = html.replace(m[0], () => out[i]);
});
writeFileSync(file, html);
console.log(`${file}: rendered ${blocks.length} chart(s)`);
