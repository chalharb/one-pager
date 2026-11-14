// Shared helpers for the summarize-in scripts. Not meant to be run directly.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUILTIN_BLOCKS = join(SKILL_DIR, 'assets', 'blocks');
export const FONTS_DIR = join(SKILL_DIR, 'assets', 'fonts');
export const HOME_NAME = '.summarize-in';

// ---------------------------------------------------------------------------
// Where things live
// ---------------------------------------------------------------------------

export function gitTop(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * The centralized home for generated summaries and custom blocks.
 *   SUMMARIZE_IN_DIR env var        -> that directory          (scope "env")
 *   inside a git repo               -> <repo-root>/.summarize-in (scope "project")
 *   otherwise                       -> ~/.summarize-in           (scope "user")
 */
export function locate(fromDir = process.cwd()) {
  if (process.env.SUMMARIZE_IN_DIR) {
    return { root: resolve(process.env.SUMMARIZE_IN_DIR), scope: 'env', repo: gitTop(fromDir) };
  }
  const repo = gitTop(fromDir);
  if (repo) return { root: join(repo, HOME_NAME), scope: 'project', repo };
  return { root: join(homedir(), HOME_NAME), scope: 'user', repo: null };
}

/** Block directories in precedence order (first wins): project/env, user, built-in. */
export function blockDirs(fromDir = process.cwd()) {
  const dirs = [];
  const here = locate(fromDir);
  dirs.push({ dir: join(here.root, 'blocks'), scope: here.scope });
  const user = join(homedir(), HOME_NAME, 'blocks');
  if (!dirs.some((d) => resolve(d.dir) === resolve(user))) dirs.push({ dir: user, scope: 'user' });
  dirs.push({ dir: BUILTIN_BLOCKS, scope: 'builtin' });
  return dirs;
}

// ---------------------------------------------------------------------------
// Block registry
// ---------------------------------------------------------------------------

/** Parse one block file: header comment, the first <style>, and example markup. */
export function parseBlock(path, scope) {
  const text = readFileSync(path, 'utf8');
  const header = text.match(/^\s*<!--([\s\S]*?)-->/)?.[1] ?? '';
  const field = (k) => header.match(new RegExp(`@${k}\\s+([\\s\\S]*?)(?=\\n\\s*@\\w+\\s|$)`))?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const name = field('block') || path.split('/').pop().replace(/\.html$/, '');
  const styleMatch = text.match(/<style>([\s\S]*?)<\/style>/);
  const css = styleMatch ? styleMatch[1].trim() : '';
  const markup = styleMatch ? text.slice(styleMatch.index + styleMatch[0].length).trim() : '';
  return { name, use: field('use'), options: field('options'), css, markup, path, scope };
}

/** All blocks, keyed by name. Custom blocks override built-ins of the same name. */
export function loadBlocks(fromDir = process.cwd()) {
  const map = new Map();
  for (const { dir, scope } of blockDirs(fromDir).reverse()) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith('.html')) continue;
      const b = parseBlock(join(dir, f), scope);
      map.set(b.name, b);
    }
  }
  return map;
}

/**
 * Selectors in a block's CSS that are not scoped to the block's root class.
 * Scoping is what lets blocks (and custom blocks) coexist without collisions.
 */
export function unscopedSelectors(block) {
  const root = `.si-${block.name}`;
  const css = block.css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = new Set();
  for (const m of css.matchAll(/(?:^|[{};])\s*([^{};@][^{};]*?)\s*\{/g)) {
    for (let sel of m[1].split(',')) {
      sel = sel.trim();
      if (!sel || sel.startsWith('@') || /^(from|to|\d+(\.\d+)?%)$/.test(sel)) continue;
      const ok = sel.startsWith(root) || sel.startsWith(`:where(${root}`) || sel.startsWith(`:is(${root}`);
      if (!ok) bad.add(sel);
    }
  }
  return [...bad];
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

export function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

// ---------------------------------------------------------------------------
// HTML text helpers
// ---------------------------------------------------------------------------

export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');
export const unescapeHtml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
export const stripTags = (s) => s.replace(/<[^>]*>/g, '');

export function dedent(s) {
  const lines = s.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  const pads = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length);
  const pad = pads.length ? Math.min(...pads) : 0;
  return lines.map((l) => l.slice(pad)).join('\n');
}

export function slugify(s, max = 60) {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'summary';
}

/** Tiny flag parser: --key value, --flag, positionals. */
export function parseArgs(argv, booleans = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) out[k] = v;
      else if (booleans.includes(k)) out[k] = true;
      else out[k] = argv[++i];
    } else out._.push(a);
  }
  return out;
}
