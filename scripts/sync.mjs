#!/usr/bin/env node
// Copy the shared files into every skill, so each skill folder works on its own
// when installed alone (the skills CLI and ChatGPT copy one folder per skill).
//
//   node scripts/sync.mjs          # write the copies
//   node scripts/sync.mjs --check  # exit 1 if any copy is out of date (CI)
//
// Edit files in shared/, never the copies in .agents/skills/<skill>/.
//   - Every file in shared/ except style.css is copied as is.
//   - shared/style.css is spliced into each skill's template.html and
//     examples/*.html between the @shared-css markers.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = join(root, 'shared');
const skillsDir = join(root, '.agents', 'skills');
const checkOnly = process.argv.includes('--check');

const START = '/* @shared-css:start (from shared/style.css; edit there, then run scripts/sync.mjs) */';
const END = '/* @shared-css:end */';
const css = readFileSync(join(shared, 'style.css'), 'utf8').trimEnd();
const block = `${START}\n${css}\n  ${END}`;
const region = /\/\* @shared-css:start[\s\S]*?\/\* @shared-css:end \*\//;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const stale = [];
const write = (path, data) => {
  const current = existsSync(path) ? readFileSync(path) : null;
  if (current && Buffer.compare(current, Buffer.from(data)) === 0) return;
  stale.push(relative(root, path));
  if (checkOnly) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

const skills = readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, 'SKILL.md')));
for (const skill of skills) {
  const dir = join(skillsDir, skill);
  for (const src of walk(shared)) {
    const rel = relative(shared, src);
    if (rel === 'style.css' || rel.endsWith('.md')) continue;
    write(join(dir, rel), readFileSync(src));
  }
  const pages = [join(dir, 'template.html')];
  if (existsSync(join(dir, 'examples'))) {
    pages.push(...readdirSync(join(dir, 'examples')).filter((f) => f.endsWith('.html')).map((f) => join(dir, 'examples', f)));
  }
  for (const page of pages) {
    if (!existsSync(page)) continue;
    const html = readFileSync(page, 'utf8');
    if (!region.test(html)) {
      console.error(`  FAIL ${relative(root, page)}: no @shared-css markers inside its <style> block`);
      process.exitCode = 1;
      continue;
    }
    write(page, html.replace(region, () => block));
  }
}

if (checkOnly && stale.length) {
  console.error(`out of date (run node scripts/sync.mjs):\n${stale.map((s) => `  ${s}`).join('\n')}`);
  process.exit(1);
}
console.log(
  checkOnly
    ? `in sync: ${skills.join(', ')}`
    : stale.length
      ? `updated ${stale.length} file(s) in ${skills.join(', ')}`
      : `already in sync: ${skills.join(', ')}`,
);
