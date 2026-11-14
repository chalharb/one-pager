// Snippet catalogue: find snippet folders, read their headers, build the index.
// Shared by index.mjs, new-block.mjs, fonts.mjs and the repo's scripts/sync.mjs.
//
// Snippets come from up to three places. A later source replaces an earlier
// one with the same name:
//   1. built-in  <skill-dir>/snippets/
//   2. user      $ONE_PAGER_HOME, else $XDG_CONFIG_HOME/one-pager, else ~/.config/one-pager
//   3. project   the nearest .one-pager/ folder at or above the working directory
// Each custom root holds snippets/blocks/*.html, snippets/shells/*.html, and an
// optional custom.css.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const skillDir = dirname(fileURLToPath(import.meta.url));
export const REQUIRED = ['name', 'use', 'fits'];
export const KINDS = ['shells', 'blocks'];

export function userRoot() {
  if (process.env.ONE_PAGER_HOME) return resolve(process.env.ONE_PAGER_HOME);
  const config = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(config, 'one-pager');
}

// Walk up from `start` to the nearest folder that contains .one-pager/.
export function projectRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, '.one-pager');
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Sources in increasing priority. `snippets` is the folder holding shells/ and blocks/.
export function sources(start = process.cwd()) {
  const list = [{ source: 'built-in', snippets: join(skillDir, 'snippets'), root: null }];
  const user = userRoot();
  if (existsSync(user)) list.push({ source: 'user', snippets: join(user, 'snippets'), root: user });
  const project = projectRoot(start);
  if (project) list.push({ source: 'project', snippets: join(project, 'snippets'), root: project });
  return list;
}

export function parseHeader(text) {
  const m = text.match(/^<!-- snippet\r?\n([\s\S]*?)\r?\n-->\r?\n/);
  if (!m) return null;
  const header = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) header[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return header;
}

// Read every snippet from the given sources. Returns { shells, blocks, problems },
// each list sorted by name, with later sources replacing earlier ones by name.
export function collect(list) {
  const problems = [];
  const out = {};
  for (const kind of KINDS) {
    const byName = new Map();
    for (const { source, snippets } of list) {
      const dir = join(snippets, kind);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.html')).sort()) {
        const path = join(dir, f);
        const header = parseHeader(readFileSync(path, 'utf8'));
        const missing = REQUIRED.filter((k) => !header?.[k]);
        if (!header) {
          problems.push(`${path}: no header; the file must start with "<!-- snippet"`);
          continue;
        }
        if (missing.length) {
          problems.push(`${path}: header needs ${missing.join(', ')}`);
          continue;
        }
        if (Object.values(header).some((v) => /\bTODO\b/.test(v))) {
          problems.push(`${path}: header still has TODO; finish it so agents know when to use the block`);
        }
        byName.set(header.name.toLowerCase(), { ...header, kind, source, path, file: `${kind}/${f}` });
      }
    }
    out[kind] = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  return { ...out, problems };
}

const cell = (s) => (s ?? '').replace(/\|/g, '\\|');

// Build the index markdown. `link(entry)` gives the text for the File column.
export function buildIndex({ shells, blocks }, { link, choosing, generatedNote, showSource }) {
  const src = showSource ? [['Source', 'source']] : [];
  const table = (rows, cols) =>
    [
      `| ${cols.map((c) => c[0]).join(' | ')} |`,
      `|${cols.map(() => '---').join('|')}|`,
      ...rows.map((r) => `| ${cols.map(([, key]) => (key === 'file' ? `\`${link(r)}\`` : cell(r[key]))).join(' | ')} |`),
    ].join('\n');
  return `# Snippets

${generatedNote}

Pick from this index, then open only the files you chose. Each file starts
with a header comment (use, fits, limit, notes on filling it in) followed by
the markup to paste. Paste the markup only, not the header. All the CSS is
already in template.html, plus any custom.css next to custom blocks.

## Shells (pick exactly one)

${table(shells, [['Shell', 'name'], ['Use when', 'use'], ['Used by', 'fits'], ...src, ['File', 'file']])}

## Blocks

${table(blocks, [['Block', 'name'], ['Use when', 'use'], ['Fits in', 'fits'], ['Limit', 'limit'], ...src, ['File', 'file']])}

${choosing.trim()}
`;
}

// The built-in "choosing" guide, kept in the skill as the tail of INDEX.md.
export function builtInChoosing() {
  const index = join(skillDir, 'snippets', 'INDEX.md');
  if (!existsSync(index)) return '';
  const text = readFileSync(index, 'utf8');
  const i = text.indexOf('## Choosing between similar blocks');
  return i === -1 ? '' : text.slice(i);
}

// Custom CSS files, in priority order (user first, project last so it wins).
export function customCss(start) {
  return sources(start)
    .filter((s) => s.root && existsSync(join(s.root, 'custom.css')))
    .map((s) => ({ source: s.source, path: join(s.root, 'custom.css') }));
}
