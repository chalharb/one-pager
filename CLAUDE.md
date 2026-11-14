# Notes for Claude

## Running headless Chrome in Claude Code cloud sessions

The cloud container runs as root and has Playwright's browsers in `/opt/pw-browsers/`.
Two things break the skill's Chrome-based scripts (`check.mjs`, Mermaid rendering in
`build.mjs`) there:

- **Full Chromium hangs with a fresh `--user-data-dir`.** `/opt/pw-browsers/chromium`
  never exits (no DOM dump, no PDF) when given a new profile folder, which the scripts
  always pass. Extra flags (`--disable-background-networking`, `--no-proxy-server`, …)
  don't help.
- **As root, Chrome needs `--no-sandbox`**, which the scripts don't pass.

Fix: point `CHROME_BIN` at a wrapper around the headless shell build instead.

```bash
HS=$(ls /opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | head -1)
printf '#!/bin/sh\nexec %s --no-sandbox "$@"\n' "$HS" > /tmp/chrome-hs && chmod +x /tmp/chrome-hs
CHROME_BIN=/tmp/chrome-hs node skills/summarize-in/scripts/check.mjs <file.html>
```

A two-page check finishes in under a second this way. Do this first instead of
debugging the hang again.

Also: the network policy blocks `cdn.jsdelivr.net`, so the Mermaid download in
`build.mjs` fails (`fetch failed`). Builds of files without diagrams still work; say
that diagram rendering was not verified rather than chasing it.
