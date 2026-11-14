---
name: summarize-in
description: >-
  Summarize any topic, file, URL, codebase, or the current conversation into a fixed
  number of printed pages, as one standalone HTML file that opens anywhere, shares
  cleanly in Slack or email, and prints exactly to the budget. Invoked as
  "summarize-in N pages TOPIC", e.g. "summarize-in 2 pages how edge networks work",
  "summarize-in 1 page the research we've done in the chat", "summarize-in a 1 page
  cheatsheet for this CLI". Use this skill whenever the user asks for a one-pager,
  two-pager, N-page summary, brief, cheat sheet, fact sheet, or printable overview,
  even if they don't name the skill.
license: MIT
compatibility: >-
  Requires Node.js 18+. Chrome, Chromium, or Edge is needed for Mermaid diagrams and the
  print check. Network access once, to cache the pinned Mermaid build.
metadata:
  version: "0.1.0"
---

# summarize-in

Turn a subject into one self-contained `.html` file that fits a page budget. The file
is assembled from blocks in `assets/blocks/`, built into a standalone page by
`scripts/build.mjs`, and verified against the budget by `scripts/check.mjs`.

`<skill-dir>` below is the folder that contains this `SKILL.md`. Resolve it to a real
path first. Run every command **from the user's working directory**, not from
`<skill-dir>`, because output paths depend on which git repo the user is in.

## 1. Read the request

The request is `<constraint> <topic>`.

- **Pages**: the number in the constraint ("2 pages", "a 1 page cheatsheet"). Default to
  1 when none is given. The budget is a maximum and a target: fill most of it.
- **Format words** shape the content:
  - "cheatsheet" or "reference": dense, mostly lists, tables, and code, with little prose.
  - "brief" or "overview": prose-led.
  - "summary" or nothing: a mix.
- **Paper**: Letter. Use A4 only when the user asks for it.
- **Orientation**: "landscape" or "portrait" anywhere in the constraint sets it
  ("1 landscape page", "2 pages landscape"). Otherwise use portrait, with one exception
  below.
- **Topic**: a subject, a file, a URL, a codebase, or "this chat" / "our research".
  Read it first. For a conversation, summarize what was established in it: decisions,
  findings, open questions, sources. Don't add new research.

**Ask about landscape when it fits better.** If the user didn't name an orientation and
the content is better laid out wide, ask before writing. Content that is better wide:

- a process or protocol best shown as one left-to-right flow or sequence diagram
  (handshakes, pipelines, request lifecycles)
- a timeline or roadmap
- a comparison table with four or more columns
- side-by-side comparisons
- a dense cheat sheet that wants three-plus columns of short items

Offer both, recommend one, and say why in a few words. For example: "Landscape
(recommended: the handshake reads as one wide sequence) or portrait?" Use your
environment's question or choice prompt if it has one. Don't ask when the content is
ordinary prose and lists; just use portrait.

Ask any other question only if the topic is truly ambiguous. Otherwise assume a smart
reader who is new to the subject.

## 2. Workflow

```
- [ ] 1. Gather facts (with sources)
- [ ] 2. Write the lede, then plan each page
- [ ] 3. Get the output path:   node <skill-dir>/scripts/where.mjs --topic "<topic>"
- [ ] 4. Write the file from the wrapper skeleton + blocks
- [ ] 5. Build:                 node <skill-dir>/scripts/build.mjs <file>
- [ ] 6. Check, fix, re-check:  node <skill-dir>/scripts/check.mjs <file> --pdf <tmp>/out.pdf
- [ ] 7. Hand over and offer to open it
```

1. **Gather.** Every number you print must be one you can source. If you can't verify a
   figure, leave it out.
2. **Plan.** Write the lede first: one or two sentences, at most ~300 characters, that
   are still useful if the reader stops there. Then decide what goes on each page. Page 1 carries the title,
   the core idea, and the most important material. Later pages hold depth and
   reference.
3. **Path.** `where.mjs` prints JSON. Write to `file`, or to `next` if `exists` is true
   and the user didn't ask to replace the earlier summary. Create the folder if needed.
   - Inside a git repo, files go to `<repo-root>/.summarize-in/`.
   - Outside a repo, files go to `$HOME/.summarize-in/`.
   - A path the user names always wins.
   - In a hosted sandbox with no project, use its output folder and return a download
     link.
4. **Write.** Read `assets/blocks/README.md` to choose blocks. Then read only the block
   files you will use and copy their example markup.
   - Start from the skeleton at the bottom of `assets/blocks/wrapper.html`.
   - Set `data-pages` to the budget and add one `<section class="si-page">` per page.
     For landscape, set `data-orientation="landscape"` on the same element.
   - Put the `title` block first on page 1 and the `si-footer` last on the last page.
   - Run `node <skill-dir>/scripts/build.mjs --list` to see custom blocks too.
   - `assets/examples/demo.html` shows a finished 2-page summary,
     `assets/examples/landscape.html` a 1-page landscape summary, and
     `assets/examples/blocks.html` every block.
5. **Build.** Building is idempotent. Re-run it after every edit. It fails on unknown
   blocks and on Mermaid syntax errors, and prints the bad source.
6. **Check.** Fix every `FAIL` and re-run until it prints `OK`. Read the warnings too.
   If you can view PDFs or images, look at the `--pdf` output once. If Chrome is
   missing, the print checks are skipped. Tell the user the page count wasn't verified.
7. **Hand over.** Give the file path, one line on what it covers, and any fact you could
   not verify. Then **ask the user whether to open it**:
   - **default browser**: `node <skill-dir>/scripts/open.mjs <file>`
   - **inside the editor**: `open.mjs <file> --detect` reports the editor and how to
     preview there. If you have your own browser or preview tool, offer it.
   - **no**: leave it.

   Use your environment's question or choice prompt if it has one. Open nothing until
   the user answers.

## 3. Writing for a page budget

- **Words per Letter page**: about 450–550 with no diagram or code, in either
  orientation. Subtract about 100
  for each diagram or 10-line code block. Cheatsheets run denser in lists and tables.
- **Lead with the point.** Title, then lede, then detail. Section headings are labels,
  not sentences.
- **Two columns with different jobs.** Use `column-2` by default. The explanation goes
  in the wide column. Definitions, steps, requirements, and a callout go in the narrow
  one.
- **Diagrams only when drawing beats writing.** Use at most one per page, keep it to
  about six nodes, and let it replace words rather than repeat them.
- **Plain language.** Use short sentences and concrete nouns. Bold a list item's first
  words only when they name the item.
- **Kicker**: `<Field> · Summarized in N pages`, for example
  `Networking · Summarized in 2 pages` (`1 page` when N is 1). For landscape you may
  write `Summarized in 1 landscape page`. Field is the broad area
  in one to three words.
- **Footer**: sources on the left, month and year on the right (`where.mjs` prints the
  date). For a conversation, the source is "This conversation".

## Gotchas

- **Overflow means cut content.** Never shrink type, margins, or spacing to make a page
  fit. In print, each sheet hides anything past its bottom edge. The page *count* can
  look right while a page silently loses its last lines. `check.mjs` measures every
  page and reports the overflow in px. Trust that, not the PDF page count alone.
- **Move content between pages by moving blocks.** Never let a block straddle two
  `.si-page` sections. Every sheet is laid out on its own.
- **Code lines wrap rather than scroll**, so what you see is what prints. Keep lines
  within the column budget in `assets/blocks/README.md` (about 50 characters in a wide
  column, 30 in a narrow one). Wrapped lines produce a warning.
- **Edit highlighted code as plain text.** After a build, `<code>` contains colour
  spans. To change code, replace the whole `<code>` body with plain escaped text
  (`&lt;`, `&gt;`, `&amp;`) and rebuild. Find-and-replace on the old text often misses
  because of the spans.
- **Edit a rendered diagram in `data-src`.** After a build, the Mermaid source lives in
  the `data-src` attribute of `.si-mermaid__svg`. Edit it there, or replace the whole
  div with a fresh `<pre class="si-mermaid__src">`, and rebuild.
- **Landscape trades height for width.** A landscape sheet is 2.5in shorter, so tall
  stacks overflow sooner. Spread content across columns rather than down. A wide
  `flowchart LR` or sequence diagram in a `column-1` band is landscape's main strength.
- **Wide diagrams shrink.** A `flowchart LR` with long labels in a column renders tiny.
  The checker fails below 65% scale. Use `flowchart TB`, shorter labels, fewer nodes,
  or put the diagram in a `column-1` band.
- **No scripts, no remote assets.** The checker rejects `<script>`, remote URLs, and
  local image paths. Images must be inline SVG or `data:` URIs.
- **Keep the markers.** The build writes styles between `<!-- si:styles -->` and
  `<!-- /si:styles -->` in `<head>`. Don't hand-edit that region; edit blocks instead.

## Custom blocks

When the built-ins can't express something the user needs (a stat row, a timeline, a
comparison card), create a custom block. Don't inline one-off styles in the summary.

```bash
node <skill-dir>/scripts/new-block.mjs <name> --use "when to use it" [--scope project|user]
```

`new-block.mjs` writes `<name>.html` under `.summarize-in/blocks/` (project scope inside
a repo, or user scope in `$HOME/.summarize-in/blocks/`). Edit it following the rules in
`assets/blocks/README.md`, use it with `data-block="<name>"`, and build. Tell the user
where the block was saved so they can reuse or commit it.

## Scripts

| Script | Purpose |
| --- | --- |
| `scripts/where.mjs` | Output path, custom-block folders, today's date (JSON). |
| `scripts/build.mjs` | Inline styles and fonts, highlight code, render Mermaid. `--list` shows blocks. |
| `scripts/check.mjs` | Standalone checks plus per-page fill, overflow, and PDF page count. `--json`, `--pdf`, `--shot`. |
| `scripts/open.mjs` | Open in the default browser. `--detect` reports the editor and preview options. |
| `scripts/new-block.mjs` | Scaffold a custom block in the centralized blocks folder. |

Each script supports `--help`. Exit codes: 0 ok, 1 failed check/build, 2 bad arguments.
