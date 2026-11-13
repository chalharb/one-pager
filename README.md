# one-pager

An [Agent Skill](https://agentskills.io) that turns any topic into a single
self-contained HTML file that reads well on screen and prints as exactly one
Letter page. It uses the Blueprint palette and fonts from loganharber.com.

It works in Claude Code, OpenAI Codex, GitHub Copilot, and ChatGPT: all four
read the same `SKILL.md` format, so there is one copy of the skill.

```
/one-pager how DNS works        # Claude Code, Copilot CLI
$one-pager how DNS works        # Codex
@one-pager how DNS works        # ChatGPT
```

Or just ask for "a one-pager about how DNS works"; every tool picks the skill up
from its description.

Inside a git repo the page is written to `.op/<topic>.html` at the repo root;
outside one it goes in the current directory. See
[`examples/dns.html`](.agents/skills/one-pager/examples/dns.html) for a sample.

Pages that are mostly things to look up, such as links to repos, Terraform
workspaces, SharePoint sites, and the people to contact, use a directory layout
instead. Ask for "a cheat sheet of our team's repos and contacts"; see
[`examples/directory.html`](.agents/skills/one-pager/examples/directory.html).

## Preview

![A one-pager about installing this skill, split down the middle: light mode on the left, dark mode on the right](docs/preview.webp)

Every page follows the reader's system theme on screen, light or dark, as in the
split above. Printing always uses the light palette, so a printout looks the same
whatever mode the screen is in.

## Requirements

- Node.js 18 or later, for the font and check scripts. Without Node, the skill
  embeds fonts with Python 3 instead and skips the automated checks.
- Google Chrome, Chromium, or Edge, for the one-page print check. Without one,
  the check is skipped and the other checks still run. Set `CHROME_BIN` if your
  browser is somewhere unusual.

## Install

### Quick install (Claude Code, Codex, Copilot, Cursor)

With Node.js 22.20 or later, the open [skills CLI](https://github.com/vercel-labs/skills)
installs straight from this repo:

```bash
npx skills add chalharb/one-pager -g
```

It asks which agents to install for; to skip the prompt, name them:

```bash
npx skills add chalharb/one-pager -g -a claude-code codex github-copilot -y
```

`-g` installs for your user, so the skill works in every project. Leave it off
to install into the current project instead. Update later with
`npx skills update`, and pin a release with `chalharb/one-pager@v1.0.0`.

The skills CLI doesn't cover ChatGPT; use the zip below for that.

### Manual install

Clone the repo once:

```bash
git clone https://github.com/chalharb/one-pager.git ~/Code/one-pager
```

The skill lives in `.agents/skills/one-pager/`. The installs below symlink it,
so a `git pull` in the clone updates every tool at once.

### Claude Code

```bash
mkdir -p ~/.claude/skills
```

```bash
ln -s ~/Code/one-pager/.agents/skills/one-pager ~/.claude/skills/one-pager
```

### Codex and GitHub Copilot

Both read personal skills from `~/.agents/skills`, so one link covers both:

```bash
mkdir -p ~/.agents/skills
```

```bash
ln -s ~/Code/one-pager/.agents/skills/one-pager ~/.agents/skills/one-pager
```

Copilot reads personal skills in the Copilot CLI and the cloud coding agent.
VS Code agent mode has been rolling out support; if the skill doesn't show up
there, install it into the project instead (below).

### ChatGPT

ChatGPT takes skills as an uploaded zip. Skills are a beta there, so a workspace
owner may need to turn them on first.

```bash
cd ~/Code/one-pager/.agents/skills && zip -rq ~/Downloads/one-pager.zip one-pager -x '*.DS_Store'
```

Then in ChatGPT go to **Skills → Create → Upload from your computer** and pick
`~/Downloads/one-pager.zip`. ChatGPT runs the skill in its own sandbox, so the
page comes back as a download link rather than a file in your repo.

### For one project only

To share the skill with everyone working in a repo, copy it into that repo
instead of your home folder. Use the folder for your tool:

| Tool | Project folder |
|---|---|
| Claude Code | `.claude/skills/` |
| Codex | `.agents/skills/` |
| Copilot | `.agents/skills/`, `.github/skills/`, or `.claude/skills/` |

```bash
mkdir -p .agents/skills
```

```bash
cp -R ~/Code/one-pager/.agents/skills/one-pager .agents/skills/
```

`.agents/skills/` covers Codex and Copilot. For Claude Code as well, copy it to
`.claude/skills/` too, or symlink it the way this repo does. Copies don't pick
up updates; copy again to refresh.

### Check it worked

Start a new session in your tool (skills load at startup) and look for
`one-pager` in its skill list: `/` in Claude Code, `/skills` in Codex,
`copilot skill list` in Copilot CLI. Or run the checker on the bundled example:

```bash
node ~/Code/one-pager/.agents/skills/one-pager/check.mjs ~/Code/one-pager/.agents/skills/one-pager/examples/dns.html
```

It should end with `OK`.

## Uninstall

Remove the links (this leaves the clone alone):

```bash
rm ~/.claude/skills/one-pager
```

```bash
rm ~/.agents/skills/one-pager
```

In ChatGPT, delete the skill from the Skills page. For a project copy, delete
the skill folder in that project.

## What's in the skill

| File | Purpose |
|---|---|
| `SKILL.md` | Instructions the agent follows when the skill runs |
| `template.html` | Page frame with every style, light, dark, and print |
| `snippets.html` | Shells (explainer, directory) and blocks (link list, contacts, steps, comparison, timeline…) to build pages from |
| `fonts.mjs` | Embeds the fonts into a finished page as base64 |
| `fonts.py` | Same as `fonts.mjs`, for sandboxes without Node |
| `diagram.mjs` | Renders Mermaid diagrams to inline SVG in the site palette (needs Chrome; downloads Mermaid once to `~/.cache/one-pager/`) |
| `check.mjs` | Fails a page that loads from the network, has leftover placeholders, or prints as more than one page |
| `fonts/` | Schibsted Grotesk and Geist Mono (latin subset) |
| `examples/dns.html` | A finished one-pager in the default explainer layout |
| `examples/directory.html` | A finished cheat sheet in the directory layout: links to repos, Terraform, SharePoint, and contacts |

`.claude/skills/one-pager` in this repo is a symlink to `.agents/skills/one-pager`,
so Claude Code, Codex, and Copilot all find the skill when you work in this repo.
On Windows, enable symlinks in Git (`git config core.symlinks true`) or the link
checks out as a plain text file.

## Fonts

Schibsted Grotesk and Geist Mono are licensed under the SIL Open Font License
1.1, which allows bundling and redistribution. The license texts ship with the
fonts in [`fonts/`](.agents/skills/one-pager/fonts/).
