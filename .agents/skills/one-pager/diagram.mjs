#!/usr/bin/env node
// Render Mermaid diagrams in a one-pager to inline SVG, so the page needs no
// JavaScript and no network.
//
//   node diagram.mjs <file.html>
//
// Finds each <pre class="mermaid">…</pre>, renders it with headless Chrome and
// a pinned Mermaid build, and replaces it with
//   <figure class="diagram" data-mermaid="…source…"><svg>…</svg></figure>
// Already-rendered figures are re-rendered from data-mermaid, so re-running is
// safe. Colours are rewritten to the page's CSS variables, so diagrams follow
// light, dark, and print modes.
//
// Mermaid is downloaded once (checksum-verified) to ~/.cache/one-pager/.

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MERMAID_VERSION = '12.2.0';
const MERMAID_SHA256 = 'a8a6a6f805b074a8261a2825c86f99c8054acb3b35f50bb7e24a4f9f2c3c3b9f';
const MERMAID_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;

// Light palette hex -> CSS variable. Keep in sync with template.html.
const PALETTE = {
  raised: '#ffffff',
  paper: '#f5f3ee',
  sand: '#e9e3d5',
  ink: '#16181d',
  muted: '#585e6a',
  line: '#dcd8ce',
  'ember-text': '#b23a12',
};

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('usage: node diagram.mjs <file.html>');
  process.exit(2);
}

const skillDir = dirname(fileURLToPath(import.meta.url));
let html = readFileSync(file, 'utf8');

const unescape = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dedent = (s) => {
  const lines = s.replace(/^\n+|\s+$/g, '').split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
};

// Collect diagrams: fresh <pre class="mermaid"> blocks and rendered figures.
const pattern = /<pre class="mermaid">([\s\S]*?)<\/pre>|<figure class="diagram" data-mermaid="([^"]*)">[\s\S]*?<\/svg>/g;
const blocks = [...html.matchAll(pattern)].map((m) => ({
  match: m[0],
  source: dedent(unescape(m[1] ?? m[2])),
}));
if (blocks.length === 0) {
  console.log(`${file}: no mermaid diagrams`);
  process.exit(0);
}

// --- Mermaid library (cached) ----------------------------------------------
const cacheDir = join(homedir(), '.cache', 'one-pager');
const lib = join(cacheDir, `mermaid-${MERMAID_VERSION}.min.js`);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
if (!existsSync(lib) || sha(readFileSync(lib)) !== MERMAID_SHA256) {
  const res = await fetch(MERMAID_URL);
  if (!res.ok) throw new Error(`download failed: ${MERMAID_URL} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== MERMAID_SHA256) throw new Error(`checksum mismatch for ${MERMAID_URL}`);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(lib, buf);
}

// --- Render in headless Chrome ---------------------------------------------
const chrome = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && existsSync(p));
if (!chrome) {
  console.error('no Chrome/Chromium found (set CHROME_BIN); cannot render diagrams');
  process.exit(1);
}

const fontUrl = (f) => pathToFileURL(join(skillDir, 'fonts', f)).href;
const config = {
  startOnLoad: false,
  theme: 'base',
  look: 'classic',
  htmlLabels: false,
  flowchart: { nodeSpacing: 22, rankSpacing: 34, padding: 8, diagramPadding: 2, minNodeWidth: 0, wrappingWidth: 150, curve: 'basis' },
  sequence: { diagramMarginX: 2, diagramMarginY: 2, actorMargin: 30, boxMargin: 6, noteMargin: 6, messageMargin: 26, mirrorActors: false },
  securityLevel: 'strict',
  fontFamily: '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif',
  themeVariables: {
    fontFamily: '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif',
    fontSize: '14px',
    background: PALETTE.raised,
    primaryColor: PALETTE.sand,
    primaryTextColor: PALETTE.ink,
    primaryBorderColor: PALETTE.muted,
    secondaryColor: PALETTE.paper,
    tertiaryColor: PALETTE.paper,
    lineColor: PALETTE.muted,
    textColor: PALETTE.ink,
    mainBkg: PALETTE.sand,
    nodeBorder: PALETTE.muted,
    clusterBkg: PALETTE.paper,
    clusterBorder: PALETTE.line,
    edgeLabelBackground: PALETTE.raised,
    titleColor: PALETTE.ink,
    actorBkg: PALETTE.sand,
    actorBorder: PALETTE.muted,
    actorTextColor: PALETTE.ink,
    actorLineColor: PALETTE.muted,
    signalColor: PALETTE.ink,
    signalTextColor: PALETTE.ink,
    labelBoxBkgColor: PALETTE.sand,
    labelBoxBorderColor: PALETTE.muted,
    labelTextColor: PALETTE.ink,
    loopTextColor: PALETTE.ink,
    noteBkgColor: PALETTE.paper,
    noteBorderColor: PALETTE.line,
    noteTextColor: PALETTE.ink,
    activationBkgColor: PALETTE.paper,
    activationBorderColor: PALETTE.muted,
    sequenceNumberColor: PALETTE.raised,
  },
};

const page = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:"Schibsted Grotesk";font-weight:400 900;src:url(${fontUrl('schibsted-grotesk-latin.woff2')})}
@font-face{font-family:"Geist Mono";font-weight:100 900;src:url(${fontUrl('geist-mono-latin.woff2')})}
body{font-family:"Schibsted Grotesk"}
</style>
<script src="${pathToFileURL(lib).href}"></script>
<pre id="out">pending</pre>
<script>
(async () => {
  const sources = ${JSON.stringify(blocks.map((b) => b.source))};
  const out = [];
  try {
    await document.fonts.load('13px "Schibsted Grotesk"');
    mermaid.initialize(${JSON.stringify(config)});
    for (let i = 0; i < sources.length; i++) {
      try {
        const { svg } = await mermaid.render('op-diagram-' + (i + 1), sources[i]);
        out.push({ svg });
      } catch (e) {
        out.push({ error: String(e && e.message || e) });
      }
    }
  } catch (e) {
    out.push({ error: 'setup: ' + String(e && e.message || e) });
  }
  document.getElementById('out').textContent = 'RESULT:' + btoa(unescape(encodeURIComponent(JSON.stringify(out))));
})();
</script>`;

const tmp = mkdtempSync(join(tmpdir(), 'one-pager-diagram-'));
let results;
try {
  const renderPage = join(tmp, 'render.html');
  writeFileSync(renderPage, page);
  const dom = execFileSync(
    chrome,
    [
      '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
      `--user-data-dir=${join(tmp, 'profile')}`, '--virtual-time-budget=20000',
      '--dump-dom', pathToFileURL(renderPage).href,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 90_000, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const encoded = dom.match(/RESULT:([A-Za-z0-9+/=]+)/)?.[1];
  if (!encoded) throw new Error('renderer produced no result (Chrome timed out or Mermaid failed to load)');
  results = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// --- Swap results into the page --------------------------------------------
const toVars = (svg) => {
  for (const [name, hex] of Object.entries(PALETTE)) {
    svg = svg.replace(new RegExp(hex, 'gi'), `var(--${name})`);
  }
  return svg;
};

let failed = 0;
blocks.forEach((b, i) => {
  const r = results[i] ?? results[results.length - 1];
  if (!r?.svg) {
    failed++;
    console.error(`  FAIL diagram ${i + 1}: ${r?.error ?? 'no output'}\n${b.source.replace(/^/gm, '    ')}`);
    return;
  }
  const figure = `<figure class="diagram" data-mermaid="${escapeAttr(b.source)}">${toVars(r.svg)}`;
  html = html.replace(b.match, () => figure + (b.match.startsWith('<pre') ? '</figure>' : ''));
});

if (failed) {
  console.error(`${file}: ${failed} of ${blocks.length} diagram(s) failed; page not changed`);
  process.exit(1);
}
writeFileSync(file, html);
console.log(`${file}: rendered ${blocks.length} diagram(s) with Mermaid ${MERMAID_VERSION}`);
