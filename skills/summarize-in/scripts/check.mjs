#!/usr/bin/env node
// Check a built summary: standalone, filled in, and printing to exactly the promised pages.
//
// usage:
//   node scripts/check.mjs <file.html> [--pdf out.pdf] [--shot out.png] [--json]
//
//   --pdf   keep the printed PDF (look at it if you can view PDFs or images)
//   --shot  save a screen screenshot of the first sheet
//   --json  machine-readable report on stdout
//
// Static checks: doctype/title/viewport, no {{placeholders}}, no <script>, nothing loaded
// over the network, styles+fonts inlined by build.mjs and current for every block used,
// no unrendered Mermaid, number of .si-page sections == data-pages.
// Print checks (need Chrome/Chromium/Edge; reported as SKIPPED without one):
// each page's fill %, vertical overflow in px, content wider than its column, and the
// printed PDF page count == data-pages.
//
// Exit codes: 0 all checks passed, 1 at least one FAIL, 2 bad arguments.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, parseArgs } from './_lib.mjs';

const args = parseArgs(process.argv.slice(2), ['json', 'help']);
const file = args._[0];
if (args.help || !file) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(args.help ? 0 : 2);
}
if (!existsSync(file)) { console.error(`error: ${file} not found`); process.exit(2); }

const html = readFileSync(file, 'utf8');
const fails = [];
const warns = [];
const notes = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// --- Static ---------------------------------------------------------------------
check(/^\s*<!doctype html>/i.test(html), 'missing <!doctype html>');
const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
check(title, 'missing or empty <title>');
check(/<meta[^>]+name=["']viewport["']/i.test(html), 'missing viewport meta tag');
const body = html.replace(/<!-- si:styles -->[\s\S]*?<!-- \/si:styles -->/, '');
const placeholders = [...new Set(body.match(/\{\{[^{}\n]{1,40}\}\}/g) ?? [])];
check(placeholders.length === 0, `unfilled placeholders: ${placeholders.join(', ')}`);
check(!/lorem ipsum/i.test(html), 'contains lorem ipsum filler');
check(!/<script\b/i.test(html), 'contains <script>: summaries must be static so they open anywhere');
const external = [
  ...html.matchAll(/<(?:script|img|iframe|video|audio|source|embed|object)\b[^>]*\b(?:src|data)=["']?((?:https?:)?\/\/[^"'\s>]+)/gi),
  ...html.matchAll(/<link\b[^>]*\bhref=["']?((?:https?:)?\/\/[^"'\s>]+)/gi),
  ...html.matchAll(/@import\s+(?:url\()?["']?((?:https?:)?\/\/[^"')\s]+)/gi),
  ...html.matchAll(/url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi),
].map((m) => m[1]);
check(external.length === 0, `loads external resources (inline them or drop them): ${[...new Set(external)].join(', ')}`);
const localSrc = [...html.matchAll(/<(?:img|source|video|audio)\b[^>]*\bsrc=["']?(?!data:|https?:|\/\/)([^"'\s>]+)/gi)].map((m) => m[1]);
check(localSrc.length === 0, `references local files that will not travel with the page (inline as data: URIs): ${localSrc.join(', ')}`);

const styleBlock = html.match(/<!-- si:styles --><style>([\s\S]*?)<\/style><!-- \/si:styles -->/)?.[1];
check(styleBlock, 'styles not inlined: run node scripts/build.mjs on this file');
if (styleBlock) {
  check(styleBlock.includes('@font-face'), 'fonts not embedded: run node scripts/build.mjs on this file');
  const used = [...new Set([...html.replace(/<!-- si:styles -->[\s\S]*?<!-- \/si:styles -->/, '').matchAll(/\bdata-block="([^"]+)"/g)].map((m) => m[1]))];
  const stale = used.filter((n) => !styleBlock.includes(`/* block: ${n}`));
  check(stale.length === 0, `CSS missing for block(s) ${stale.join(', ')}: re-run node scripts/build.mjs`);
}
check(!/<pre class="si-mermaid__src">/.test(html), 'unrendered Mermaid diagram: run node scripts/build.mjs');

const docTag = html.match(/<main[^>]*class="si-doc"[^>]*>/)?.[0] ?? '';
const promised = Number(docTag.match(/data-pages="(\d+)"/)?.[1] ?? NaN);
const sheets = (html.match(/<section class="si-page"/g) ?? []).length;
check(docTag, 'no <main class="si-doc"> element: start from the wrapper block skeleton');
check(Number.isInteger(promised) && promised > 0, 'data-pages on .si-doc must be the page budget, e.g. data-pages="2"');
check(sheets === promised, `data-pages="${promised}" but the file has ${sheets} <section class="si-page"> sheet(s); make them match`);
const lede = html.match(/<p class="si-title__lede">([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
if (lede && lede.length > 300) warns.push(`lede is ${lede.length} characters; keep it under ~300 (about 45 words)`);
const kicker = html.match(/<p class="si-title__kicker">([^<]*)<\/p>/)?.[1]?.trim();
if (kicker) {
  const n = kicker.match(/· Summarized in (\d+) (?:landscape )?pages?$/)?.[1];
  if (!n) warns.push(`kicker "${kicker}" should follow "<Field> · Summarized in N pages"`);
  else if (Number(n) !== promised) warns.push(`kicker says ${n} page(s) but data-pages is ${promised}`);
}
if (!/id="si-theme"/.test(html)) warns.push('no light/dark toggle: copy the #si-theme checkbox and its label from the wrapper skeleton');
if (!/class="si-footer"/.test(html)) warns.push('no .si-footer: add sources and date as the last child of the last page');

const kb = statSync(file).size / 1024;
if (kb > 1024) warns.push(`file is ${kb.toFixed(0)} KB; Slack and email previews prefer under 1 MB`);

// --- Print ------------------------------------------------------------------------
const MEASURE = `<script>
(async () => {
  await document.fonts.ready;
  const px = (v) => parseFloat(v) || 0;
  const pages = [...document.querySelectorAll('.si-page')].map((p, i) => {
    const cs = getComputedStyle(p);
    const sheet = px(cs.minHeight);
    p.style.minHeight = '0';
    const natural = p.getBoundingClientRect().height;
    p.style.minHeight = '';
    const box = p.getBoundingClientRect();
    const right = box.right - px(cs.paddingRight) + 1;
    const wide = [];
    for (const el of p.querySelectorAll('*')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > right) wide.push((el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) + ' +' + Math.round(r.right - right) + 'px');
      if (wide.length > 4) break;
    }
    const words = (p.innerText || '').split(/\\s+/).filter(Boolean).length;
    const diagrams = [...p.querySelectorAll('.si-mermaid__svg svg')].map((svg) => {
      const vb = svg.viewBox && svg.viewBox.baseVal;
      return vb && vb.width ? Math.round((svg.getBoundingClientRect().width / vb.width) * 100) : 100;
    });
    const wrapped = [...p.querySelectorAll('.si-code pre')].filter((pre) => {
      const s = getComputedStyle(pre);
      const lines = pre.textContent.replace(/\\n$/, '').split('\\n').length;
      const inner = pre.clientHeight - px(s.paddingTop) - px(s.paddingBottom);
      return inner > lines * px(s.lineHeight) + 2;
    }).map((pre) => (pre.textContent.split('\\n').find((l) => l.length > 30) || '').trim().slice(0, 40));
    return { page: i + 1, sheet: Math.round(sheet), natural: Math.round(natural), words, wide, diagrams, wrapped };
  });
  document.body.setAttribute('data-si-measure', btoa(JSON.stringify(pages)));
  document.body.insertAdjacentHTML('beforeend', '<pre id="si-measure">MEASURE:' + btoa(JSON.stringify(pages)) + '</pre>');
})();
</script>`;

const chrome = findChrome();
let printed = null;
let measured = [];
if (!chrome) {
  notes.push('print check SKIPPED: no Chrome/Chromium/Edge found (set CHROME_BIN)');
} else {
  const tmp = mkdtempSync(join(tmpdir(), 'summarize-in-check-'));
  const run = (url, extra, opts = {}) => execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files',
    `--user-data-dir=${join(tmp, 'profile')}`, ...extra, url,
  ], { timeout: 90_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', opts.capture ? 'pipe' : 'ignore', 'ignore'], encoding: opts.capture ? 'utf8' : undefined });
  try {
    // Measure in a copy next to the original so relative paths behave the same.
    const probe = join(dirname(resolve(file)), `.si-measure-${process.pid}.html`);
    writeFileSync(probe, html.replace(/<\/body>/i, `${MEASURE}</body>`));
    try {
      const dom = run(pathToFileURL(probe).href, ['--window-size=1400,1200', '--virtual-time-budget=10000', '--dump-dom'], { capture: true });
      const enc = dom.match(/MEASURE:([A-Za-z0-9+/=]+)/)?.[1];
      measured = enc ? JSON.parse(Buffer.from(enc, 'base64').toString('utf8')) : [];
    } finally {
      rmSync(probe, { force: true });
    }
    for (const m of measured) {
      const fill = Math.round((m.natural / m.sheet) * 100);
      m.fill = fill;
      if (m.natural > m.sheet + 1) fails.push(`page ${m.page} overflows by ${m.natural - m.sheet}px (${fill}% full): cut or tighten content on that page; never shrink type or margins`);
      if (m.wide.length) fails.push(`page ${m.page} has content wider than its column: ${m.wide.join(', ')}`);
      for (const [k, scale] of m.diagrams.entries()) {
        const msg = `page ${m.page} diagram ${k + 1} is drawn at ${scale}% of its natural size, so its labels shrink: use flowchart TB, fewer or shorter nodes, or move it to a column-1 band`;
        if (scale < 65) fails.push(msg);
        else if (scale < 80) warns.push(msg);
      }
      if (m.wrapped.length) warns.push(`page ${m.page} has code lines that wrap (${m.wrapped.length} block(s), e.g. "${m.wrapped[0]}…"): shorten lines to the column width`);
    }

    const pdf = args.pdf ? resolve(args.pdf) : join(tmp, 'out.pdf');
    run(pathToFileURL(resolve(file)).href, [`--print-to-pdf=${pdf}`, '--no-pdf-header-footer']);
    const pdfText = readFileSync(pdf, 'latin1');
    printed = (pdfText.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
    const box = pdfText.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
    const wantLandscape = /data-orientation="landscape"/.test(docTag);
    if (box) check((+box[1] > +box[2]) === wantLandscape, `PDF sheets are ${+box[1] > +box[2] ? 'landscape' : 'portrait'} but data-orientation says ${wantLandscape ? 'landscape' : 'portrait'}: re-run node scripts/build.mjs`);
    check(printed === promised, `prints as ${printed} page(s); the budget is ${promised}`);
    if (args.pdf) notes.push(`pdf: ${pdf}`);
    if (args.shot) {
      const shot = resolve(args.shot);
      run(pathToFileURL(resolve(file)).href, [`--screenshot=${shot}`, '--window-size=1000,1180']);
      notes.push(`screenshot: ${shot}`);
    }
  } catch (err) {
    fails.push(`chrome failed: ${String(err.message).split('\n')[0]}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
const last = measured[measured.length - 1];
if (last && last.fill < 55 && promised > 1) warns.push(`last page is only ${last.fill}% full: fine if the content is complete, otherwise use the room`);

// --- Report -------------------------------------------------------------------------
const report = {
  file, title, ok: fails.length === 0, budget: promised, printedPages: printed, kb: Math.round(kb),
  pages: measured.map(({ page, fill, words }) => ({ page, fill, words })), fails, warnings: warns, notes,
};
if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${file}: "${title ?? '?'}" — ${kb.toFixed(0)} KB, budget ${promised} page(s)${printed === null ? '' : `, prints ${printed}`}`);
  for (const m of measured) console.log(`  page ${m.page}: ${m.fill}% full, ${m.words} words`);
  for (const n of notes) console.log(`  ${n}`);
  for (const w of warns) console.log(`  warn ${w}`);
  for (const f of fails) console.error(`  FAIL ${f}`);
  if (!fails.length) console.log('  OK');
}
process.exit(fails.length ? 1 : 0);
