#!/usr/bin/env node
// Scaffold a custom block in the centralized blocks folder, ready to edit.
//
// usage:
//   node scripts/new-block.mjs <name> [--use "when to use it"] [--scope project|user] [--from DIR] [--force] [--dry-run]
//
//   --scope project  <repo-root>/.summarize-in/blocks/ (default inside a git repo)
//   --scope user     ~/.summarize-in/blocks/ (default outside a repo; shared by every project)
//
// The block's CSS must be scoped to its root class .si-<name>; build.mjs warns otherwise.
// A custom block with a built-in's name overrides the built-in.
// Prints JSON {path, name, overrides}. Exit codes: 0 ok, 1 exists (use --force), 2 bad arguments.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { BUILTIN_BLOCKS, HOME_NAME, locate, parseArgs, slugify } from './_lib.mjs';

const args = parseArgs(process.argv.slice(2), ['force', 'dry-run', 'help']);
const raw = args._[0];
if (args.help || !raw) {
  console.log('usage: node scripts/new-block.mjs <name> [--use "..."] [--scope project|user] [--force] [--dry-run]');
  process.exit(args.help ? 0 : 2);
}
const name = slugify(raw, 40);
const here = locate(resolve(args.from ?? process.cwd()));
const scope = args.scope ?? (here.scope === 'user' ? 'user' : 'project');
if (!['project', 'user'].includes(scope)) { console.error('error: --scope must be project or user'); process.exit(2); }
if (scope === 'project' && !here.repo && here.scope !== 'env') { console.error('error: not inside a git repo; use --scope user'); process.exit(2); }
const dir = scope === 'user' ? join(homedir(), HOME_NAME, 'blocks') : join(here.root, 'blocks');
const path = join(dir, `${name}.html`);
const overrides = existsSync(join(BUILTIN_BLOCKS, `${name}.html`));
if (existsSync(path) && !args.force) { console.error(`error: ${path} exists (use --force to replace)`); process.exit(1); }

const c = `.si-${name}`;
const text = `<!--
@block ${name}
@use ${args.use ?? 'Describe when an agent should pick this block, in one sentence.'}
@options Describe any data-* attributes or optional parts.
-->
<style>
/* Scope every selector to ${c}. Use only theme tokens (var(--si-ink), --si-muted, --si-sand,
   --si-line, --si-ember, --si-ember-text, --si-cobalt, --si-green, --si-amber, --si-red,
   --si-sans, --si-mono, --si-gap) so dark mode and print keep working. */
${c} { display: flex; flex-direction: column; gap: 6px; break-inside: avoid; }
${c}__label { margin: 0; font: 500 10.5px/1.4 var(--si-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--si-muted); }
</style>

<div class="si-${name}" data-block="${name}">
  <p class="si-${name}__label">${name}</p>
  <p>Example content.</p>
</div>
`;
if (!args['dry-run']) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
console.log(JSON.stringify({ path, name, scope, overrides, dryRun: !!args['dry-run'] }, null, 2));
