---
name: one-pager
description: Generate a "one-pager" — a single self-contained HTML file that explains any topic on exactly one printable page. Use when asked to make, write, create, or generate a one-pager, one-page summary, fact sheet, cheat sheet, brief, or overview of a topic, product, person, project, or document as an HTML file.
---

# one-pager

Turn any subject into one self-contained `.html` file that reads well on
screen and prints as exactly one Letter page. The skill is a page frame
with every style already in it (`template.html`), a catalogue of shells and
blocks to build the page from (`snippets.html`), two worked examples
(`examples/`), diagram and chart renderers (`diagram.mjs`, `chart.mjs`), a
font embedder (`fonts.mjs`), and a checker (`check.mjs`) that enforces the
rules below. For more than one page, use the summarize-in skill.

`<skill-dir>` below means the folder that contains this `SKILL.md`. Resolve
it to a real path before running anything; do not assume a location such
as `.claude/skills` or `.agents/skills`.

## Steps

1. **Pin down the subject and reader.** The topic is whatever the user
   asked for when invoking the skill. If it is a file, URL, or codebase,
   read it first. Only ask a question if the topic is truly ambiguous;
   otherwise assume a smart reader who is new to the subject.
2. **Gather facts.** Use what the user gave you, then research anything
   you are not sure of. Every number on the page must be one you can
   source. If you cannot verify a figure, leave it out instead of guessing.
3. **Decide the one message.** Write the lede first: one or two sentences
   that would still be useful if the reader stopped there. Everything else
   on the page supports it.
4. **Write the file.** Pick the output path first:

   ```bash
   git rev-parse --show-toplevel
   ```

   - Inside a git repo (the command prints a path): write to
     `<repo-root>/.op/<topic-slug>.html`, creating `.op/` if needed. Use
     the repo root even when working in a subdirectory.
   - Not in a repo (the command fails): write to `<topic-slug>.html` in
     the current directory.
   - In a hosted sandbox with no project (for example ChatGPT): write to
     the sandbox's working or output folder and give the user a download
     link to the file.
   - A path the user names always wins.

   Copy `<skill-dir>/template.html` to that path, then build the page
   from `<skill-dir>/snippets.html` as described in **Building the page**
   below: one shell, then the blocks that suit the content. Replace every
   `{{PLACEHOLDER}}`.
5. **Render the figure, if any.** Skip this if the page has none.

   ```bash
   node <skill-dir>/diagram.mjs <output.html>   # Mermaid diagram
   node <skill-dir>/chart.mjs <output.html>     # data chart
   ```

   Each replaces its `<pre>` block with an inline SVG and keeps the source
   in a `data-` attribute, so edit that and re-run to change it.
   `diagram.mjs` needs Chrome; without it, cut the diagram. `chart.mjs`
   needs only Node.
6. **Embed the fonts.** Do this last, after the content is final.

   ```bash
   node <skill-dir>/fonts.mjs <output.html>
   ```

   If `node` is not installed, use the Python version, which does the same:

   ```bash
   python3 <skill-dir>/fonts.py <output.html>
   ```

7. **Check it.**

   ```bash
   node <skill-dir>/check.mjs <output.html> --shot <scratch>/one-pager.png
   ```

   Fix every `FAIL`, then look at the screenshot. Re-run until it prints
   `OK`. If `node` is not installed, check by hand that no `{{...}}`
   placeholders remain and nothing loads from `http`, and tell the user the
   one-page print check was not run.
8. **Hand it over.** Give the user the file path (or download link) and one
   line on what the page covers. Mention any fact you could not verify.

## Building the page

`template.html` is the frame: the stylesheet, the header (kicker, title,
lede) and the footer. Between them is a `<!-- @main -->` marker. Read
`snippets.html` and fill the frame from it in this order.

1. **Pick one shell** and paste it at the marker, replacing the comment.
   - **Explainer** (`<main>`): the reader wants to *understand* something.
     A wide column for the explanation and a narrow one for reference
     material. Most topics. `examples/dns.html`.
   - **Directory** (`<main class="directory">`): the reader wants to *find*
     things, such as links to repos, Terraform workspaces, SharePoint sites,
     dashboards and runbooks, and the people to contact. Sections flow down
     two balanced columns. Cheat sheets, "where everything lives" pages,
     team directories. `examples/directory.html`.
2. **Fill it with blocks.** Each block in `snippets.html` says when to use
   it, where it fits, and its limit. Paste the markup only, without the
   catalogue comments, and repeat `<li>`, `<tr>` or `<section>` as needed.
3. **Full-width blocks** (stat row, comparison table) go between the header
   and the shell. In the directory shell, a comparison or contacts table
   goes in a `<section class="span">` instead.

| Block | Use it for |
|---|---|
| paragraph section, point list | The explanation itself |
| steps | An ordered procedure |
| facts | Short label / value pairs: owner, version, cost |
| terms | A glossary |
| link list | Repos, sites, dashboards, docs, each with a short printed URL |
| contacts | Who to ask, with role and email or channel |
| command | A command, config or query people copy |
| timeline | History, a rollout plan, deadlines |
| comparison | Two to four options against the same criteria |
| stat row | Two to four numbers that are the point (off by default) |
| diagram | A flow or structure that is clearer drawn (one figure at most) |
| chart | A bar or line chart of sourced numbers (one figure at most) |
| callout | The takeaway or the one thing not to miss (one at most) |

Composition rules:

- **Fewer kinds of block is better.** Use at most five kinds besides
  paragraphs. A block that adds nothing makes the page worse.
- **Don't write CSS.** Every block is already styled for light, dark and
  print. Don't add `style` attributes, new colours or new classes; the
  checker fails the first two. If nothing fits, use a plain paragraph or
  list, and tell the user which block was missing.
- **Group by what the reader looks for.** In a directory, group by kind
  (Code, Infrastructure, Docs, People) or by system: two to six groups,
  each a section with an `<h2>`.

Rules for links and contacts (any shell):

- **Link text is a name, never a URL.** Readers scan for names.
- **The short URL is for paper.** Printed links can't be clicked, so the
  `.url` line shows where each one goes: host plus the meaningful path
  (`github.contoso.com/payments/ledger`,
  `contoso.sharepoint.com/sites/Payments`). Drop `https://`, query strings,
  and noise such as `/Forms/AllItems.aspx` or `?csf=1&web=1`. Under a host
  already shown above it, `…/sites/Payments/Runbooks` is enough.
- **Never invent a link or a contact.** Use only URLs, names, roles and
  addresses the user gave you or that you read from a source. If one is
  missing, leave the entry out and say so in the hand-over. The checker
  fails an empty or `#` href.

What changes in the directory shell:

- **No word target.** Measure in entries: about 15–30 links and up to
  about 10 contacts fit. The lede is one sentence or two short ones.
- **Kicker is `<Team or system> · Cheat sheet`.**
- **Footer**: the owning team on the left, and on the right the month
  and year the links were last checked (`Links checked November 2026`),
  because this kind of page goes stale.
- **When it overflows**, cut the descriptions first, then the least-used
  links, and ask the user which to drop if it still does not fit. If the
  content really needs two pages, say so; do not shrink the type.

## Delegating (optional)

Do the work yourself by default. If your tool can start subagents, hand
off in two cases only. Tools that can't delegate skip this section.

- **Large source material.** When the topic is a big codebase or a long
  document, have a subagent read it during step 2 and return a list of
  facts, each with its source (file and line, page, or URL). Write the
  page from that list.
- **Fact-check.** When the page leans on figures, dates, or claims you
  researched, have a subagent that did not write the page check it after
  step 7. Give it the page and ask for each claim marked confirmed, wrong,
  or unsourced, with a source for every confirmed one. Fix or cut
  anything not confirmed, then re-run the checker.

Ask subagents for claims and sources, not prose. Do not delegate the
writing.

## Rules for the page

- **One file, no network.** All CSS inline. No external scripts,
  stylesheets, fonts, or images. Use inline SVG for any diagram.
  Ordinary `<a href>` links are fine.
- **Site fonts, embedded.** Schibsted Grotesk for text and headings,
  Geist Mono for the kicker, section labels, code, and footer, as on
  loganharber.com. Use weights 400, 500, and 600 only. The font scripts
  inline both from `fonts/` as base64 in place of the `<!-- @fonts -->`
  marker before `</body>`; keep that marker when reshaping the template.
- **One printed page.** The checker prints the file with headless Chrome
  and fails if the PDF is not exactly one page. When it overflows, cut
  words. Do not shrink the type or the margins.
- **About 300–450 words** of body text in the explainer shell. The DNS
  example is about 330. The directory shell is measured in entries
  instead (see **Building the page**).
- **Lead with the point.** Kicker, title, lede, then the detail.
- **Kicker is `<Field> · One-pager`.** The field is the broad area the
  topic sits in, in two or three words: `Web platforms · One-pager`,
  `Networking · One-pager`, `Personal finance · One-pager`.
- **The stat row is off by default.** Delete it unless two to four numbers
  are the point of the topic, the figures a reader would quote back
  (a price, a deadline, a growth rate). Trivia such as a founding year or
  a port number is noise; put it in the text or leave it out. Never
  invent a number to fill a tile.
- **Diagrams only when drawing beats writing.** Use one Mermaid diagram
  when the topic is a flow, sequence, or structure that a list explains
  badly. Keep it small: at most about six nodes, labels of one to three
  words, `flowchart LR` or `sequenceDiagram`. It goes in the wide column
  next to the text it illustrates, and it replaces words rather than
  repeating them. No styling, colours, or `classDef` in the source; the
  renderer applies the palette. One figure per page at most: a diagram
  or a chart, not both. A chart follows the same rule as the stat row:
  only when the numbers are the point, every value sourced.
- **Two columns of different jobs** (explainer shell). The wide column carries the
  explanation; the narrow one carries reference material (definitions,
  key terms, steps, a takeaway callout).
- **Fixed palette.** The colours are the Blueprint palette from the
  loganharber.com redesign: `--paper` behind the page, `--raised` for the
  page, `--sand` for tiles and callouts, `--ember-text` for accent text,
  `--ember` for accent rules, `--cobalt` for links. Do not recolour per
  topic and do not add colours outside it; the checker fails any.
- **Plain language.** Short sentences, concrete nouns, no filler, no
  lorem ipsum. Bold the first few words of a list item only when it
  names the item.
- **Footer.** Sources on the left, month and year on the right.

## The checker

```bash
node <skill-dir>/check.mjs <skill-dir>/examples/dns.html
```

```
…/examples/dns.html: "DNS in one page" — 374 words, 99.2 KB, 1 printed page(s)
  OK
```

It exits 1 and lists each problem when the file has no doctype, title,
viewport tag, or print rules; has leftover `{{PLACEHOLDERS}}`; has an
unrendered Mermaid block; has not had its fonts embedded; has no
`<main>` shell or leftover catalogue comments; has a `style` attribute or a
colour outside the palette; has a link with an empty or `#` href; loads
anything over the network; is larger than
500 KB; or prints as more or fewer than one page.

Flags: `--shot out.png` saves a screenshot, `--pdf out.pdf` keeps the
printed PDF.

## Gotchas

- **Do not print a page in full after embedding fonts.** The font block is
  about 91 KB of base64 on two lines at the end of the file, and that
  includes `examples/dns.html`. Read only the first 150 lines, or open it
  in a browser. To change an embedded page, edit the text you need; the
  font scripts are safe to re-run.
- **Print is always light.** Dark mode is wrapped in
  `@media screen and (prefers-color-scheme: dark)`, so it never reaches
  print, and the print block sets `color-scheme: light`. Keep it that way
  when editing the CSS; the checker fails a bare
  `@media (prefers-color-scheme: dark)`. The `--shot` screenshot still
  follows the system theme, so it is dark on a machine in dark mode.
- **The print check needs Chrome.** It looks for Chrome, Chromium, or
  Edge in the usual macOS and Linux locations, or `CHROME_BIN`. Without
  one, the print check is reported as `SKIPPED` and the other checks
  still run, so say that the page length was not verified.
- **Don't edit the shared files in this folder.** In the source repo, the
  stylesheet, scripts, fonts and `snippets.html` live in `shared/` and are
  copied into every skill by `scripts/sync.mjs`. Change them there and
  re-run it. The palette appears in `shared/style.css` (light, dark and
  print) and in the `PALETTE` list in `shared/check.mjs`.
- **Wide diagrams shrink their text.** The SVG scales down to fit the
  column, so a diagram with many side-by-side nodes ends up with tiny
  labels. If a rendered diagram's text looks smaller than the body text,
  cut nodes or shorten labels. Fan-outs (one node to three) stay readable.
- **The first diagram render downloads Mermaid** (about 5 MB, pinned and
  checksum-verified) to `~/.cache/one-pager/`. Later renders are offline.
- **`auto-fit` stat tiles reflow.** Three or four tiles sit on one row at
  print width; five wrap to a second row and cost about an inch.
- **Running the checker on `template.html` fails on purpose.** It lists
  every placeholder that still needs filling.
