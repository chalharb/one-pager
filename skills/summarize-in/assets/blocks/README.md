# Blocks

Each block is one `.html` file: a header comment (`@block`, `@use`, `@options`), one
`<style>` scoped to the block's root class `.si-<name>`, then example markup to copy.
`scripts/build.mjs` inlines the CSS of only the blocks a document uses (found by their
`data-block="<name>"` attribute), so every summary is a single standalone file.

See every block rendered in `../examples/blocks.html`, and real summaries in
`../examples/demo.html` (2 pages, portrait) and `../examples/landscape.html` (1 page,
landscape).

## Available blocks

| Block | File | Use it for |
| --- | --- | --- |
| **wrapper** | `wrapper.html` | The document shell. Copy its markup to start every summary. Owns theme tokens, light/dark mode, page sheets, footer, print rules, and base prose styles (`p`, `ul`, `ol`, `dl`, `table`, inline `code`, `kbd`, `blockquote`), plus the CSS-only light/dark toggle, which is hidden in print. |
| **column-1** | `column-1.html` | A full-width stack: prose-led pages, wide tables, wide diagrams, or a band under a two-column area. |
| **column-2** | `column-2.html` | Two columns with different jobs: explanation on one side, reference material on the other. `data-split="wide-left"` (default), `"wide-right"`, `"even"`. The default layout for most pages. |
| **title** | `title.html` | Kicker (`<Field> · Summarized in N pages`), headline, and a full-width lede of at most ~300 characters. Once, at the top of page 1. |
| **subtitle** | `subtitle.html` | Section heading: a mono uppercase label over a hairline. First child of each `<section>`. `data-tone="accent"` for one highlighted heading. |
| **code** | `code.html` | Code, commands, config, headers. Highlighted at build time (no JS). Optional filename label. Lines wrap, so keep them short. |
| **mermaid** | `mermaid.html` | One flow, sequence, or structure per page that a list would explain badly. Rendered to themed inline SVG at build time. |
| **callout** | `callout.html` | A takeaway, tip, or warning pulled out of the flow. `data-tone`: `note` (default), `info`, `tip`, `warn`, `danger`. At most two per page. |

## Line-length budget for code (Letter, 12px mono)

| Where | Portrait | Landscape |
| --- | --- | --- |
| column-1 | 90 characters | 125 characters |
| column-2, wide column | 50 characters | 70 characters |
| column-2, even split | 40 characters | 58 characters |
| column-2, narrow column | 30 characters | 44 characters |

Landscape: set `data-orientation="landscape"` on `.si-doc`. Sheets become 11 × 8.5in
(or 297 × 210mm for A4).

## Theme tokens

Use these in blocks rather than raw colours. They switch for dark mode on screen and
reset to light for print.

`--si-paper` page background · `--si-raised` sheet · `--si-sand` code/callout fill ·
`--si-ink` text · `--si-muted` secondary text · `--si-line` hairlines ·
`--si-ember` / `--si-ember-text` accent · `--si-cobalt` links/info ·
`--si-green` · `--si-amber` · `--si-red` · `--si-sans` · `--si-mono` · `--si-gap` stack spacing.

## Custom blocks

Custom blocks live outside the skill, next to the generated summaries:

- `<repo-root>/.summarize-in/blocks/` for one project
- `$HOME/.summarize-in/blocks/` for every project

Scaffold one with `node scripts/new-block.mjs <name> --use "when to use it"`. The rules:

1. Root element: `class="si-<name>" data-block="<name>"`.
2. Every selector starts with `.si-<name>`. The build warns about any that don't.
3. Colours, fonts, and spacing come from the tokens above.
4. Add `break-inside: avoid` if the block should never split across sheets.

A custom block with a built-in's name replaces the built-in. Project blocks win over
user blocks. `node scripts/build.mjs --list` shows what's available from the current
folder.

## How isolation works

- Wrapper base styles are wrapped in `:where()`, which gives them zero specificity, so
  any block class beats them.
- Block styles only target their own `.si-<name>` subtree.
- Custom block CSS is emitted after built-in CSS, so a custom block wins ties.
- Mermaid diagrams carry styles scoped to their own SVG id.
