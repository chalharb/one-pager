#!/usr/bin/env node
// Print the snippet index: built-in shells and blocks plus any custom ones.
//
//   node index.mjs [--from <dir>]
//
// Custom snippets live outside the skill, so they survive skill updates:
//   user:    ~/.config/one-pager/snippets/{blocks,shells}/  (or $ONE_PAGER_HOME)
//   project: .one-pager/snippets/{blocks,shells}/ at or above the working directory
// A custom snippet with the same name as a built-in one replaces it.
// --from sets where to start looking for .one-pager/ (default: working directory).

import { builtInChoosing, buildIndex, collect, customCss, sources } from './snippets.mjs';

const args = process.argv.slice(2);
const i = args.indexOf('--from');
const from = i === -1 ? process.cwd() : args[i + 1];

const list = sources(from);
const found = collect(list);
const custom = list.length > 1;
const css = customCss(from);

let note = custom
  ? `Built-in and custom snippets. Custom roots: ${list.filter((s) => s.root).map((s) => `${s.source} (${s.root})`).join(', ')}.`
  : 'Built-in snippets only. To add your own, run new-block.mjs.';
if (css.length) note += `\nCustom styles: ${css.map((c) => c.path).join(', ')}; fonts.mjs inlines them into the page.`;

process.stdout.write(
  buildIndex(found, { link: (e) => e.path, choosing: builtInChoosing(), generatedNote: note, showSource: custom }),
);
for (const p of found.problems) console.error(`  WARN ${p}`);
