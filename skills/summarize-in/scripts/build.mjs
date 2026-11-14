#!/usr/bin/env node
// Build a summary in place so it opens standalone: no shared CSS, no scripts, no network.
//
// usage:
//   node scripts/build.mjs <file.html>          build (idempotent; safe to re-run after edits)
//   node scripts/build.mjs --list [--from DIR]  list available blocks (built-in + custom) as JSON
//   node scripts/build.mjs --help
//
// What a build does, in order:
//   1. Syntax-highlights every <code data-lang="..."> (re-highlights from plain text on rebuild).
//   2. Renders every Mermaid source (<pre class="si-mermaid__src">, or data-src on an already
//      rendered diagram) to inline SVG. Needs Chrome/Chromium/Edge; Mermaid is cached on first use.
//   3. Collects the blocks named by data-block="..." and inlines the wrapper CSS plus only those
//      blocks' CSS, then the two fonts as base64, between <!-- si:styles --> and <!-- /si:styles -->.
//
// Custom blocks are read from <repo>/.summarize-in/blocks/ and ~/.summarize-in/blocks/ and
// override built-ins of the same name.
//
// Exit codes: 0 built, 1 build error (unknown block, failed diagram, missing marker), 2 bad arguments.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  FONTS_DIR, dedent, escapeAttr, loadBlocks, parseArgs, stripTags, unescapeHtml, unscopedSelectors,
} from './_lib.mjs';
import { highlight, resolveLang } from './_highlight.mjs';
import { renderMermaid, themeSvg } from './_mermaid.mjs';

const args = parseArgs(process.argv.slice(2), ['list', 'help', 'json']);
const usage = () => console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
if (args.help) { usage(); process.exit(0); }

if (args.list) {
  const blocks = [...loadBlocks(resolve(args.from ?? process.cwd())).values()]
    .map(({ name, use, options, scope, path }) => ({ name, scope, use, options, path }));
  console.log(JSON.stringify(blocks, null, 2));
  process.exit(0);
}

const file = args._[0];
if (!file) { usage(); process.exit(2); }
if (!existsSync(file)) { console.error(`error: ${file} not found`); process.exit(2); }

let html = readFileSync(file, 'utf8');
const errors = [];
const warnings = [];

// 1. Syntax highlighting ----------------------------------------------------
let highlighted = 0;
html = html.replace(/<code(\s[^>]*\bdata-lang="([^"]*)"[^>]*)>([\s\S]*?)<\/code>/g, (_, attrs, lang, inner) => {
  if (!resolveLang(lang)) warnings.push(`unknown code language "${lang}"; shown without colour (see the code block's @use list)`);
  highlighted++;
  return `<code${attrs}>${highlight(unescapeHtml(stripTags(inner)), lang)}</code>`;
});

// 2. Mermaid ------------------------------------------------------------------
const MERMAID_RE = /<pre class="si-mermaid__src">([\s\S]*?)<\/pre>|<div class="si-mermaid__svg" data-src="([^"]*)">[\s\S]*?<!--\/si-mermaid-->/g;
const diagrams = [...html.matchAll(MERMAID_RE)].map((m) => ({
  match: m[0],
  source: dedent(unescapeHtml(m[1] ?? m[2])),
}));
if (diagrams.length) {
  try {
    const results = await renderMermaid(diagrams.map((d) => d.source));
    diagrams.forEach((d, i) => {
      const r = results[i];
      if (!r?.svg) {
        errors.push(`diagram ${i + 1} failed: ${r?.error ?? 'no output'}\n${d.source.replace(/^/gm, '      ')}`);
        return;
      }
      const out = `<div class="si-mermaid__svg" data-src="${escapeAttr(d.source)}">${themeSvg(r.svg)}<!--/si-mermaid-->`;
      html = html.replace(d.match, () => out);
    });
  } catch (e) {
    errors.push(e.message);
  }
}

// 3. Styles + fonts -------------------------------------------------------------
const blocks = loadBlocks(dirname(resolve(file)));
const used = [...new Set([...html.matchAll(/\bdata-block="([^"]+)"/g)].map((m) => m[1]))];
if (!used.includes('wrapper')) errors.push('no data-block="wrapper" found: start the file from the wrapper block skeleton');
const unknown = used.filter((n) => !blocks.has(n));
if (unknown.length) errors.push(`unknown block(s): ${unknown.join(', ')}. Available: ${[...blocks.keys()].join(', ')}`);

const order = [...blocks.values()].filter((b) => used.includes(b.name));
order.sort((a, b) => (a.name === 'wrapper' ? -1 : b.name === 'wrapper' ? 1 : 0) || (a.scope === 'builtin' ? 0 : 1) - (b.scope === 'builtin' ? 0 : 1));
for (const b of order) {
  if (b.name === 'wrapper') continue;
  const bad = unscopedSelectors(b);
  if (bad.length) warnings.push(`block "${b.name}" (${b.path}) has selectors not scoped to .si-${b.name}: ${bad.join(' | ')}`);
}

const docTag = html.match(/<main[^>]*class="si-doc"[^>]*>/)?.[0] ?? '';
const paper = docTag.match(/\bdata-paper="([^"]+)"/)?.[1] ?? 'letter';
const orientation = docTag.match(/\bdata-orientation="([^"]+)"/)?.[1] ?? 'portrait';
if (!['letter', 'a4'].includes(paper)) errors.push(`data-paper="${paper}" is not supported: use "letter" or "a4"`);
if (!['portrait', 'landscape'].includes(orientation)) errors.push(`data-orientation="${orientation}" is not supported: use "portrait" or "landscape"`);
const pageRule = paper === 'letter' && orientation === 'portrait' ? '' : `@page { size: ${paper === 'a4' ? 'A4' : 'letter'} ${orientation}; margin: 0; }`;
const font = (family, f, weight) => {
  const b64 = readFileSync(join(FONTS_DIR, f)).toString('base64');
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
};
const css = [
  '/* summarize-in: generated by scripts/build.mjs. Edit the blocks, not this. Fonts: SIL OFL 1.1. */',
  font('Schibsted Grotesk', 'schibsted-grotesk-latin.woff2', '400 900'),
  font('Geist Mono', 'geist-mono-latin.woff2', '100 900'),
  ...order.map((b) => `/* block: ${b.name}${b.scope === 'builtin' ? '' : ` (custom, ${b.scope})`} */\n${b.css}`),
  pageRule,
].filter(Boolean).join('\n');

const STYLE_RE = /<!-- si:styles -->[\s\S]*?<!-- \/si:styles -->/;
if (!STYLE_RE.test(html)) errors.push('missing <!-- si:styles --><!-- /si:styles --> markers in <head>: copy them from the wrapper block');
else html = html.replace(STYLE_RE, () => `<!-- si:styles --><style>\n${css}\n</style><!-- /si:styles -->`);

// Report ----------------------------------------------------------------------
for (const w of warnings) console.error(`  warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  FAIL  ${e}`);
  console.error(`${file}: not written (${errors.length} error(s))`);
  process.exit(1);
}
writeFileSync(file, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`${file}: built — blocks: ${order.map((b) => b.name).join(', ')}; ${highlighted} code block(s), ${diagrams.length} diagram(s); ${kb} KB`);
console.log('next: node scripts/check.mjs ' + file);
