#!/usr/bin/env node
// Decide where a summary is written and where custom blocks live. Creates nothing.
//
// usage:
//   node scripts/where.mjs --topic "how edge networks work" [--from DIR]
//
// Prints JSON:
//   { "root": ".../.summarize-in", "scope": "project|user|env", "repo": "<git root or null>",
//     "file": ".../.summarize-in/how-edge-networks-work.html", "exists": false,
//     "blocks": [".../.summarize-in/blocks", "~/.summarize-in/blocks"], "date": "November 2026" }
//
// Rules: SUMMARIZE_IN_DIR wins; inside a git repo the root is <repo-root>/.summarize-in
// (even from a subdirectory); otherwise ~/.summarize-in. When "file" already exists,
// "next" holds the first free numbered name (-2, -3, ...).
// Exit codes: 0 ok, 2 bad arguments.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { blockDirs, locate, parseArgs, slugify } from './_lib.mjs';

const args = parseArgs(process.argv.slice(2), ['help']);
if (args.help || !args.topic) {
  console.log(`usage: node scripts/where.mjs --topic "<topic>" [--from DIR]   (see the header of this file)`);
  process.exit(args.help ? 0 : 2);
}
const from = resolve(args.from ?? process.cwd());
const here = locate(from);
const slug = slugify(args.topic);
const file = join(here.root, `${slug}.html`);
let next = null;
if (existsSync(file)) {
  for (let n = 2; ; n++) {
    const f = join(here.root, `${slug}-${n}.html`);
    if (!existsSync(f)) { next = f; break; }
  }
}
const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
console.log(JSON.stringify({
  root: here.root, scope: here.scope, repo: here.repo, slug, file, exists: !!next, next,
  blocks: blockDirs(from).filter((d) => d.scope !== 'builtin').map((d) => d.dir), date,
}, null, 2));
