// Find a local Chrome, Chromium, or Edge for headless printing and rendering.
// Shared by check.mjs and diagram.mjs. Set CHROME_BIN to override the search.

import { existsSync } from 'node:fs';

export function findChrome() {
  return [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => p && existsSync(p));
}

// Chrome refuses to start as root (common in containers and some CI) unless
// its sandbox is off, so turn it off only in that case.
export function headlessArgs() {
  const root = typeof process.getuid === 'function' && process.getuid() === 0;
  return ['--headless=new', '--disable-gpu', ...(root ? ['--no-sandbox'] : [])];
}
