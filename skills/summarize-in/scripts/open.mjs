#!/usr/bin/env node
// Open a summary in the default browser, and report which editor (if any) is hosting
// the session so the agent can offer an in-editor preview instead.
//
// usage:
//   node scripts/open.mjs <file.html>            open in the default browser
//   node scripts/open.mjs <file.html> --detect   only print JSON (url, editor, preview hint); open nothing
//
// Exit codes: 0 ok, 1 the open command failed, 2 bad arguments.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from './_lib.mjs';

const args = parseArgs(process.argv.slice(2), ['detect', 'help']);
const file = args._[0];
if (args.help || !file) {
  console.log('usage: node scripts/open.mjs <file.html> [--detect]');
  process.exit(args.help ? 0 : 2);
}
if (!existsSync(file)) { console.error(`error: ${file} not found`); process.exit(2); }

const env = process.env;
const editor =
  env.CURSOR_TRACE_ID || /cursor/i.test(env.VSCODE_GIT_ASKPASS_MAIN ?? '') ? 'cursor'
  : /windsurf/i.test(env.VSCODE_GIT_ASKPASS_MAIN ?? '') ? 'windsurf'
  : env.TERM_PROGRAM === 'vscode' || env.VSCODE_PID || env.VSCODE_IPC_HOOK_CLI ? 'vscode'
  : /jetbrains/i.test(env.TERMINAL_EMULATOR ?? '') ? 'jetbrains'
  : env.ZED_TERM || env.TERM_PROGRAM === 'zed' ? 'zed'
  : null;
const hints = {
  vscode: 'VS Code: with the Live Preview extension, run "Live Preview: Show Preview" on the file.',
  cursor: 'Cursor: open it in the built-in browser (its browser tool or tab), or use the Live Preview extension.',
  windsurf: 'Windsurf: use the Live Preview extension, or the built-in browser preview if available.',
  jetbrains: 'JetBrains IDEs: open the file, then the browser icons in the editor corner > Built-in Preview.',
  zed: null,
};
const abs = resolve(file);
const info = { file: abs, url: pathToFileURL(abs).href, editor, editorPreview: editor ? hints[editor] : null };
if (args.detect) { console.log(JSON.stringify(info, null, 2)); process.exit(0); }

const [cmd, cmdArgs] =
  process.platform === 'darwin' ? ['open', [abs]]
  : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', abs]]
  : ['xdg-open', [abs]];
const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true });
child.on('error', (e) => { console.error(`error: could not run ${cmd}: ${e.message}. Open ${info.url} manually.`); process.exit(1); });
child.on('spawn', () => { child.unref(); console.log(JSON.stringify({ ...info, opened: 'default-browser' }, null, 2)); });
