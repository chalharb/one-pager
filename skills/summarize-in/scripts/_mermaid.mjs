// Render Mermaid sources to SVG with headless Chrome and a pinned, checksum-verified
// Mermaid build (downloaded once to ~/.cache/summarize-in/). Colours are rewritten to
// the theme's CSS variables so diagrams follow dark mode and print.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FONTS_DIR, findChrome } from './_lib.mjs';

const MERMAID_VERSION = '12.2.0';
const MERMAID_SHA256 = 'a8a6a6f805b074a8261a2825c86f99c8054acb3b35f50bb7e24a4f9f2c3c3b9f';
const MERMAID_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;

// Light-theme hex -> token. Keep in sync with the wrapper block.
const PALETTE = {
  'si-raised': '#ffffff',
  'si-paper': '#f5f3ee',
  'si-sand': '#e9e3d5',
  'si-ink': '#16181d',
  'si-muted': '#585e6a',
  'si-line': '#dcd8ce',
  'si-ember-text': '#b23a12',
};

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function mermaidLib() {
  const dir = join(homedir(), '.cache', 'summarize-in');
  const lib = join(dir, `mermaid-${MERMAID_VERSION}.min.js`);
  if (existsSync(lib) && sha(readFileSync(lib)) === MERMAID_SHA256) return lib;
  const res = await fetch(MERMAID_URL);
  if (!res.ok) throw new Error(`could not download Mermaid (${res.status}) from ${MERMAID_URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== MERMAID_SHA256) throw new Error(`checksum mismatch for ${MERMAID_URL}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(lib, buf);
  return lib;
}

const SANS = '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif';
const P = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k.replace('si-', ''), v]));
const CONFIG = {
  startOnLoad: false, fontSize: 13, theme: 'base', look: 'classic', htmlLabels: false, securityLevel: 'strict',
  fontFamily: SANS,
  flowchart: { nodeSpacing: 22, rankSpacing: 32, padding: 8, minNodeWidth: 0, diagramPadding: 2, wrappingWidth: 150, curve: 'basis', htmlLabels: false },
  sequence: { actorFontSize: 13, messageFontSize: 13, noteFontSize: 12, diagramMarginX: 2, diagramMarginY: 2, width: 96, height: 36, actorMargin: 24, boxMargin: 6, noteMargin: 6, messageMargin: 26, mirrorActors: false },
  themeVariables: {
    fontFamily: SANS, fontSize: '13px', background: P.raised,
    primaryColor: P.sand, primaryTextColor: P.ink, primaryBorderColor: P.muted,
    secondaryColor: P.paper, tertiaryColor: P.paper, lineColor: P.muted, textColor: P.ink,
    mainBkg: P.sand, nodeBorder: P.muted, clusterBkg: P.paper, clusterBorder: P.line,
    edgeLabelBackground: P.raised, titleColor: P.ink,
    actorBkg: P.sand, actorBorder: P.muted, actorTextColor: P.ink, actorLineColor: P.muted,
    signalColor: P.ink, signalTextColor: P.ink, labelBoxBkgColor: P.sand, labelBoxBorderColor: P.muted,
    labelTextColor: P.ink, loopTextColor: P.ink, noteBkgColor: P.paper, noteBorderColor: P.line,
    noteTextColor: P.ink, activationBkgColor: P.paper, activationBorderColor: P.muted,
    sequenceNumberColor: P.raised,
  },
};

/** Render sources -> [{svg} | {error}], one per source. */
export async function renderMermaid(sources) {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome/Chromium/Edge found (set CHROME_BIN); cannot render Mermaid');
  const lib = await mermaidLib();
  const font = (f) => pathToFileURL(join(FONTS_DIR, f)).href;
  const page = `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:"Schibsted Grotesk";font-weight:400 900;src:url(${font('schibsted-grotesk-latin.woff2')})}
body{font-family:"Schibsted Grotesk"}
</style>
<script src="${pathToFileURL(lib).href}"></script>
<pre id="out">pending</pre>
<script>
(async () => {
  const sources = ${JSON.stringify(sources)};
  const out = [];
  try {
    await document.fonts.load('13px "Schibsted Grotesk"');
    mermaid.initialize(${JSON.stringify(CONFIG)});
    for (let i = 0; i < sources.length; i++) {
      try { const { svg } = await mermaid.render('si-mermaid-' + (i + 1), sources[i]); out.push({ svg }); }
      catch (e) { out.push({ error: String(e && e.message || e) }); }
    }
  } catch (e) { out.push({ error: 'setup: ' + String(e && e.message || e) }); }
  document.getElementById('out').textContent = 'RESULT:' + btoa(unescape(encodeURIComponent(JSON.stringify(out))));
})();
</script>`;
  const tmp = mkdtempSync(join(tmpdir(), 'summarize-in-mermaid-'));
  try {
    const file = join(tmp, 'render.html');
    writeFileSync(file, page);
    const dom = execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-first-run',
      `--user-data-dir=${join(tmp, 'profile')}`, '--virtual-time-budget=20000', '--dump-dom', pathToFileURL(file).href,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 90_000, stdio: ['ignore', 'pipe', 'ignore'] });
    const encoded = dom.match(/RESULT:([A-Za-z0-9+/=]+)/)?.[1];
    if (!encoded) throw new Error('Mermaid renderer produced no result (Chrome timed out or Mermaid failed to load)');
    const results = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    return sources.map((_, i) => results[i] ?? results[results.length - 1]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Swap palette hex values for theme variables. */
export function themeSvg(svg) {
  for (const [name, hex] of Object.entries(PALETTE)) svg = svg.replace(new RegExp(hex, 'gi'), `var(--${name})`);
  return svg;
}
