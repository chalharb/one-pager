#!/usr/bin/env node
// Validate a page: self-contained, filled in, on-palette, and exactly the right
// number of printed pages. The count comes from <meta name="op-pages" content="N">
// (1 when absent, as for a one-pager).
//
//   node check.mjs <file.html> [--shot out.png] [--pdf out.pdf]
//
// Exit 0 = all checks passed. Exit 1 = at least one failure (listed on stderr).
// The print check needs Chrome/Chromium; without one it is reported as SKIPPED.

import { readFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, headlessArgs } from './chrome.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args.splice(i, 2)[1];
};
const shotPath = opt('--shot');
const pdfPath = opt('--pdf');
const file = args[0];

if (!file) {
  console.error('usage: node check.mjs <file.html> [--shot out.png] [--pdf out.pdf]');
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`not found: ${file}`);
  process.exit(2);
}

const html = readFileSync(file, 'utf8');
const failures = [];
const notes = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// --- Static checks ---------------------------------------------------------
check(/^\s*<!doctype html>/i.test(html), 'missing <!doctype html>');
const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
check(title, 'missing or empty <title>');
check(/<meta[^>]+name=["']viewport["']/i.test(html), 'missing viewport meta tag');
check(/@media\s+print/i.test(html), 'missing @media print rules');
check(
  !/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/i.test(html),
  'dark mode must be screen-only so print stays light: use "@media screen and (prefers-color-scheme: dark)"',
);

const placeholders = [...new Set(html.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [])];
check(placeholders.length === 0, `unfilled placeholders: ${placeholders.join(', ')}`);
check(!/lorem ipsum/i.test(html), 'contains lorem ipsum filler');
// No drift from the shared stylesheet: no inline styles, no colours outside the
// palette. Rendered diagrams (<svg>) and the embedded font block are exempt.
const PALETTE = new Set([
  '#f5f3ee', '#ffffff', '#fff', '#e9e3d5', '#16181d', '#585e6a', '#dcd8ce', '#c4401a', '#b23a12', '#2c55c9',
  '#0f1013', '#1c1f25', '#2a2620', '#eceae4', '#a1a6b0', '#2a2e36', '#ff6b3d', '#ff8a63', '#7c9cff',
]);
const own = html
  .replace(/<svg[\s\S]*?<\/svg>/gi, '')
  .replace(/<!-- @fonts:start[\s\S]*?@fonts:end -->/, '');
const inlineStyles = (own.replace(/<style[\s\S]*?<\/style>/gi, '').match(/<[a-z][^>]*\sstyle\s*=/gi) ?? []).length;
check(inlineStyles === 0, `${inlineStyles} element(s) with a style attribute: use the blocks in snippets/, which are already styled`);
const offPalette = [...new Set(
  ((own.match(/<style[\s\S]*?<\/style>/gi) ?? []).join('')
    .match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/gi) ?? [])
    .map((c) => c.toLowerCase())
    .filter((c) => !PALETTE.has(c)),
)];
check(offPalette.length === 0, `colours outside the palette: ${offPalette.join(', ')}`);
check(/<main\b/i.test(own.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '')), 'no <main>: paste a shell from snippets/shells/ at the <!-- @main --> marker');
check(!/<!-- snippet\b|<!-- @main/.test(html), 'leftover snippet header or @main marker comment: paste only the markup below a snippet\'s header');

const deadLinks = html.match(/<a\b[^>]*\bhref=["']\s*#?\s*["']/gi) ?? [];
check(deadLinks.length === 0, `${deadLinks.length} link(s) with an empty or "#" href: use the real URL or remove the entry`);
check(!/<pre class="mermaid">/.test(html), 'unrendered mermaid diagram: run diagram.mjs on this file');
check(!/<pre class="chart">/.test(html), 'unrendered chart: run chart.mjs on this file');
check(!html.includes('<!-- @fonts -->'), 'fonts not embedded: run fonts.mjs on this file');
check(/<!-- @fonts:start/.test(html) || html.includes('<!-- @fonts -->'), 'no font block: restore the <!-- @fonts --> marker before </body> and run fonts.mjs');

// Must open offline: nothing loaded over the network. Plain <a href> links are fine.
const external = [
  ...html.matchAll(/<(?:script|img|iframe|video|audio|source|embed)\b[^>]*\bsrc=["']?((?:https?:)?\/\/[^"'\s>]+)/gi),
  ...html.matchAll(/<link\b[^>]*\bhref=["']?((?:https?:)?\/\/[^"'\s>]+)/gi),
  ...html.matchAll(/@import\s+(?:url\()?["']?((?:https?:)?\/\/[^"')\s]+)/gi),
  ...html.matchAll(/url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi),
].map((m) => m[1]);
check(external.length === 0, `loads external resources: ${[...new Set(external)].join(', ')}`);

const kb = statSync(file).size / 1024;
check(kb <= 500, `file is ${kb.toFixed(0)} KB (limit 500 KB)`);

// --- Print check: must be exactly the declared number of pages -------------
const pagesMeta = html.match(/<meta[^>]+name=["']op-pages["'][^>]*content=["']([^"']*)["']/i)?.[1];
const want = pagesMeta === undefined ? 1 : Number(pagesMeta);
check(Number.isInteger(want) && want >= 1 && want <= 4, `<meta name="op-pages"> must be a whole number from 1 to 4, not "${pagesMeta}"`);
const chrome = findChrome();

let pages = null;
if (!chrome) {
  notes.push('print check SKIPPED: no Chrome/Chromium found (set CHROME_BIN)');
} else {
  const tmp = mkdtempSync(join(tmpdir(), 'one-pager-'));
  const url = pathToFileURL(resolve(file)).href;
  const run = (extra) =>
    execFileSync(
      chrome,
      [...headlessArgs(), '--hide-scrollbars', `--user-data-dir=${join(tmp, 'profile')}`, ...extra, url],
      { stdio: 'ignore', timeout: 60_000 },
    );
  try {
    const pdf = pdfPath ? resolve(pdfPath) : join(tmp, 'out.pdf');
    run([`--print-to-pdf=${pdf}`, '--no-pdf-header-footer']);
    // Count page objects; "/Type /Pages" (the tree root) must not match.
    pages = (readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
    check(
      pages === want,
      pages > want
        ? `prints as ${pages} pages; it must print as exactly ${want} — cut content`
        : `prints as ${pages} page(s); it must print as exactly ${want} — add depth or lower op-pages`,
    );
    if (pdfPath) notes.push(`pdf: ${pdf}`);
    if (shotPath) {
      const shot = resolve(shotPath);
      run([`--screenshot=${shot}`, '--window-size=1100,1500']);
      notes.push(`screenshot: ${shot}`);
    }
  } catch (err) {
    failures.push(`chrome failed: ${err.message.split('\n')[0]}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- Report ----------------------------------------------------------------
const words = html
  .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .split(/\s+/)
  .filter(Boolean).length;

console.log(`${file}: "${title ?? '?'}" — ${words} words, ${kb.toFixed(1)} KB${pages === null ? '' : `, ${pages} printed page(s)`}`);
for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log('  OK');
