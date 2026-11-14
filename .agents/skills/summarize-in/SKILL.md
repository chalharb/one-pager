---
name: summarize-in
description: Summarize any topic in a set number of printed pages (2 to 4) as a single self-contained HTML file, with room for diagrams and data charts. Use when asked to "summarize in N pages", for a two-, three- or four-page summary, brief, or explainer, or when a topic needs more space than one page for charts and diagrams. For exactly one page, use the one-pager skill instead.
---

# summarize-in

Turn any subject into one self-contained `.html` file that reads well on
screen and prints as exactly N Letter pages, with charts and diagrams where
they explain better than words. It shares its look, blocks and scripts with
the one-pager skill: a page frame with every style already in it
(`template.html`), a catalogue of shells and blocks (`snippets.html`), a chart
renderer (`chart.mjs`), a diagram renderer (`diagram.mjs`), a font embedder
(`fonts.mjs`), and a checker (`check.mjs`).

`<skill-dir>` below means the folder that contains this `SKILL.md`. Resolve
it to a real path before running anything; do not assume a location.

## Reading the request

The request reads as `/summarize-in <N> pages <topic>`, for example
`/summarize-in 2 pages how edge networks function`. Take the page count from
the start of the request:

- Accept a digit or a word, and `page`, `pages` or `-page`: `2 pages`,
  `three pages`, `4-page`, `in 2 pages`.
- No count given: use 2.
- More than 4: use 4 and say so. A longer document is a report, not a
  summary.
- Exactly 1: use the one-pager skill if it is installed; otherwise carry on
  with N = 1.

Everything after the count is the topic. Fix obvious slips silently ("the edge
networks function" is "how edge networks function"). Ask a question only if
the topic is truly ambiguous.

## Steps

1. **Pin down the subject and reader.** If the topic is a file, URL, or
   codebase, read it first. Otherwise assume a smart reader who is new to
   the subject.
2. **Gather facts.** Use what the user gave you, then research anything you
   are not sure of. Every number on the page, including every value in a
   chart, must be one you can source. A computed series is fine when its
   caption says how it was computed. If you cannot verify a figure, leave it
   out instead of guessing.
3. **Decide the one message, then plan the pages.** Write the lede first:
   one or two sentences that would still be useful if the reader stopped
   there. Then sketch what each page carries: page 1 is the overview, later
   pages go deeper. Each page gets one or two figures (chart, diagram,
   comparison or stat row) and the text that explains them.
4. **Write the file.** Pick the output path:

   ```bash
   git rev-parse --show-toplevel
   ```

   - Inside a git repo: `<repo-root>/.op/<topic-slug>.html`, creating
     `.op/` if needed.
   - Not in a repo: `<topic-slug>.html` in the current directory.
   - In a hosted sandbox with no project (for example ChatGPT): the
     sandbox's output folder, with a download link for the user.
   - A path the user names always wins.

   Copy `<skill-dir>/template.html` there. Set `<meta name="op-pages">` to
   N, fill the header, then paste the **report** shell from
   `<skill-dir>/snippets.html` at the `<!-- @main -->` marker and build the
   pages from its blocks (see **Building the pages**). Replace every
   `{{PLACEHOLDER}}`.
5. **Render charts and diagrams.**

   ```bash
   node <skill-dir>/chart.mjs <output.html>
   node <skill-dir>/diagram.mjs <output.html>
   ```

   `chart.mjs` needs only Node. `diagram.mjs` needs Chrome; without it, swap
   the diagram for a list or a chart. Both keep the source in a `data-`
   attribute, so edit that and re-run to change a figure.
6. **Embed the fonts.** Do this last, after the content is final.

   ```bash
   node <skill-dir>/fonts.mjs <output.html>
   ```

   Without Node, use `python3 <skill-dir>/fonts.py <output.html>`.
7. **Check it.**

   ```bash
   node <skill-dir>/check.mjs <output.html> --pdf <scratch>/summary.pdf
   ```

   Fix every `FAIL` and re-run until it prints `OK`. Then look at every
   page of the PDF: no page should end with a large blank gap, a figure
   should sit next to the text about it, and the last page should be at
   least half full. Move blocks, or cut and add depth, until it reads well.
8. **Hand it over.** Give the user the file path (or download link) and one
   line on what each page covers. Mention any fact you could not verify.

## Building the pages

Use the **report** shell: a stack of rows. A row is a wide column for the
explanation and a narrow one for reference material (`class="row"`), or two
halves (`class="row even"`), such as two charts side by side. Full-width
charts, diagrams, comparison tables and stat rows go between rows.

Content flows from page to page on its own; a section or figure never splits
across a page break. To start something on a fresh page, add `page-break`
to that row's class. Use it at most once per page break, only when a page
would otherwise end on an orphaned heading or a big gap.

Each block in `snippets.html` says when to use it, where it fits, and its
limit. Paste the markup only, without the catalogue comments.

| Block | Use it for |
|---|---|
| paragraph section, point list | The explanation itself |
| steps | An ordered procedure |
| facts, terms | Short label / value pairs; a glossary |
| link list, contacts | Where to go next; who to ask |
| command | A command, config or query people copy |
| timeline | History, a rollout plan, deadlines |
| comparison | Two to four options against the same criteria |
| stat row | Two to four numbers that are the point |
| chart | Amounts (bar) or change across an ordered scale (line) |
| diagram | A flow, sequence, structure or state machine |
| callout | The takeaway or the one thing not to miss |

### Budget per page

- **About 350–450 words of text per page** on top of the figures. A two-page
  summary is about 700–900 words; use the extra room for depth, never for
  bigger type.
- **One or two figures per page**, three at most. At least one chart or
  diagram on the whole document; a figure must earn its space by showing
  what a paragraph cannot.
- **One callout per page** at most.
- **Header on page 1 only**: kicker, title, lede. Page numbers print in the
  bottom margin automatically.

### Charts

- **Bar** for comparing amounts across categories (2–8 bars). **Line** for
  change across an ordered scale such as time or distance (3–12 points).
- **One or two series.** The palette has two series colours, cobalt then
  ember. A third series means a second chart.
- **One axis.** Two measures of different scale are two charts.
- **The title is the takeaway** ("Round trips add up fast"), not a
  description of the axes. Say where the data came from in `source`.
- **Width.** Match where the chart sits, so its text prints at body size:
  leave `width` out in a wide column, `"half"` in one half of a `row even`,
  `"full"` between rows. Never put a chart in a narrow column.
- Bars are labelled with their values, and lines with their last value.
  Every mark has a hover tooltip, and every chart a collapsible data table
  that is hidden in print.

### Diagrams

- At most one per printed page, and only when drawing beats writing.
- In a column, about 6 nodes; at full width between rows, up to about 12.
  Labels of one to three words. `flowchart LR`, `sequenceDiagram` or
  `stateDiagram-v2`. No styling, colours or `classDef`; the renderer applies
  the palette.

## Rules for the page

- **One file, no network.** All CSS inline. No external scripts,
  stylesheets, fonts, or images. Ordinary `<a href>` links are fine.
- **Exactly N printed pages.** The checker prints the file with headless
  Chrome and fails if the page count differs from `op-pages`. When it
  overflows, cut words or a figure. Do not shrink the type or the margins.
  When it falls short, add depth, not padding.
- **Lead with the point.** Kicker, title, lede, then the detail.
- **Kicker is `<Field> · <N>-page summary`**, with N as a word:
  `Networking · Two-page summary`.
- **Don't write CSS.** Every block is already styled for light, dark and
  print. No `style` attributes, new colours or new classes; the checker
  fails the first two. If nothing fits, use a plain paragraph or list, and
  tell the user which block was missing.
- **Fixed palette.** The Blueprint palette from loganharber.com. Do not
  recolour per topic.
- **Plain language.** Short sentences, concrete nouns, no filler. Bold the
  first few words of a list item only when it names the item.
- **Footer.** Sources on the left, month and year on the right, at the end
  of the last page.

## The checker

```bash
node <skill-dir>/check.mjs <skill-dir>/examples/edge-networks.html
```

It exits 1 and lists each problem when the file has no doctype, title,
viewport tag, or print rules; has leftover `{{PLACEHOLDERS}}`; has an
unrendered chart or Mermaid block; has not had its fonts embedded; has no
`<main>` shell or leftover catalogue comments; has a `style` attribute or a
colour outside the palette; has a link with an empty or `#` href; loads
anything over the network; is larger than 500 KB; or prints as a different
number of pages than `op-pages` says.

Flags: `--pdf out.pdf` keeps the printed PDF, `--shot out.png` saves a
screenshot of the screen view.

## Gotchas

- **Do not print a page in full after embedding fonts.** The font block is
  about 91 KB of base64 at the end of the file. Read only the part you need.
- **Print is always light**, whatever the screen theme.
- **The print check needs Chrome**, found in the usual macOS and Linux
  locations or via `CHROME_BIN`. Without one, the check is `SKIPPED`; say
  that the page count was not verified. As root (containers, some CI), the
  scripts turn off Chrome's sandbox, which it requires there.
- **Chart text is sized for print.** Charts are drawn at the column or page
  width they print at, so labels match the body text. Long category labels
  squeeze the bars; shorten them.
- **The first diagram render downloads Mermaid** (about 5 MB, pinned and
  checksum-verified) to `~/.cache/one-pager/`. Later renders are offline.
- **Don't edit the shared files in this folder.** In the source repo, the
  stylesheet, scripts, fonts and `snippets.html` live in `shared/` and are
  copied into every skill by `scripts/sync.mjs`. Change them there and
  re-run it.
- **Running the checker on `template.html` fails on purpose.** It lists
  every placeholder that still needs filling.
