#!/usr/bin/env node
// Start a custom block (or shell) outside the skill folder, so it survives
// skill updates and shows up in index.mjs.
//
//   node new-block.mjs "pros cons"             # project if .one-pager/ exists, else user
//   node new-block.mjs "pros cons" --project   # <cwd>/.one-pager/snippets/blocks/
//   node new-block.mjs "pros cons" --user      # ~/.config/one-pager/snippets/blocks/
//   node new-block.mjs "two charts" --shell    # a shell instead of a block

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot, userRoot } from './snippets.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const name = args.find((a) => !a.startsWith('--'));
if (!name) {
  console.error('usage: node new-block.mjs "<name>" [--project | --user] [--shell]');
  process.exit(2);
}

const kind = flag('--shell') ? 'shells' : 'blocks';
const root = flag('--user')
  ? userRoot()
  : flag('--project')
    ? join(process.cwd(), '.one-pager')
    : (projectRoot() ?? userRoot());
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dir = join(root, 'snippets', kind);
const file = join(dir, `${slug}.html`);
if (existsSync(file)) {
  console.error(`${file} already exists`);
  process.exit(1);
}

const markup =
  kind === 'shells'
    ? `  <main class="report">
    <!-- rows and full-width blocks -->
  </main>
`
    : `      <section>
        <h2>{{HEADING}}</h2>
        <p>{{TEXT}}</p>
      </section>
`;

mkdirSync(dir, { recursive: true });
writeFileSync(
  file,
  `<!-- snippet
name: ${name}
use: TODO one sentence: when should an agent pick this ${kind === 'shells' ? 'shell' : 'block'}?
fits: TODO where it goes: wide column, narrow column, full width, directory section
limit: TODO how much fits, e.g. 3-6 items
notes: TODO how to fill it in. Use classes from template.html; put any new styles in custom.css next to snippets/, using palette variables such as var(--ember).
-->
${markup}`,
);
console.log(`created ${file}
next: replace the TODOs and the markup, then run index.mjs to see it listed.
styles: add rules to ${join(root, 'custom.css')} (palette variables only).`);
