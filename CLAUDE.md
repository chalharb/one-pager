# Notes for Claude

## Running headless Chrome in Claude Code cloud sessions

The cloud container runs as root, and its `CHROME_BIN` points at a full Chromium build.
Two things used to break the skill's Chrome-based scripts there:

- **Full Chromium hangs with a fresh `--user-data-dir`** unless it also gets
  `--disable-field-trial-config`. It never renders or exits.
- **As root, Chrome needs `--no-sandbox`.**

The scripts in `skills/summarize-in/scripts/` now pass both flags (see `chromeFlags()` in
`_lib.mjs`), so `build.mjs` and `check.mjs` should just work. If you run Chrome headless
yourself for anything else here, pass the same two flags rather than debugging the hang
again.

If you're on a checkout that predates that fix, use Playwright's headless shell instead:

```bash
HS=$(ls /opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | head -1)
printf '#!/bin/sh\nexec %s --no-sandbox "$@"\n' "$HS" > /tmp/chrome-hs && chmod +x /tmp/chrome-hs
CHROME_BIN=/tmp/chrome-hs node skills/summarize-in/scripts/check.mjs <file.html>
```

## Mermaid in cloud sessions

The network policy blocks `cdn.jsdelivr.net`, so `build.mjs` can't download Mermaid
(`fetch failed`). The npm registry is allowed, and its copy matches the pinned checksum:

```bash
cd "$(mktemp -d)" && npm pack mermaid@12.2.0 --silent && tar xzf mermaid-12.2.0.tgz
mkdir -p ~/.cache/summarize-in && cp package/dist/mermaid.min.js ~/.cache/summarize-in/mermaid-12.2.0.min.js
```
