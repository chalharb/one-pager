// Shared helpers for the summarize-in scripts. Not meant to be run directly.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
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

/**
 * Playwright's chrome-headless-shell builds. They start fast, exit cleanly, and don't hang
 * on a fresh profile the way some full Chromium builds do in containers.
 */
function headlessShells() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    join(homedir(), '.cache', 'ms-playwright'),
    join(homedir(), 'Library', 'Caches', 'ms-playwright'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'),
  ].filter(Boolean);
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let dirs = [];
    try { dirs = readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse(); } catch { continue; }
    for (const d of dirs) {
      let subs = [];
      try { subs = readdirSync(join(root, d)).filter((s) => s.startsWith('chrome-headless-shell')); } catch { continue; }
      for (const sub of subs) {
        found.push(join(root, d, sub, 'chrome-headless-shell'), join(root, d, sub, 'chrome-headless-shell.exe'));
      }
    }
  }
  return found;
}

/** First match for any of `names` on PATH. */
function onPath(names) {
  const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const n of names) for (const e of exts) {
      const p = join(dir, n + e);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** Chrome, Chromium, or Edge. CHROME_BIN / CHROME_PATH win; null when none is found. */
export function findChrome() {
  const local = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    ...headlessShells(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    local && join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((p) => p && existsSync(p))
    ?? onPath(['chrome-headless-shell', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'microsoft-edge', 'msedge']);
}

/**
 * Flags every headless run needs.
 * - A throwaway profile, so a Chrome the user already has open doesn't take over the run.
 * - --disable-field-trial-config: with a fresh profile and no route to Google's servers,
 *   full Chromium builds can hang forever before rendering anything (seen in cloud sandboxes).
 * - --no-sandbox as root: Chrome refuses to start as root (Docker, CI, cloud sandboxes) otherwise.
 */
export function chromeFlags(profileDir) {
  const flags = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-field-trial-config',
    '--allow-file-access-from-files', `--user-data-dir=${profileDir}`,
  ];
  if (process.getuid?.() === 0) flags.push('--no-sandbox');
  return flags;
}

/** The command to run one of this skill's scripts, with an absolute path so it works from any folder. */
export const scriptCmd = (name) => `node ${join(SKILL_DIR, 'scripts', name)}`;

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
