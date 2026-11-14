# Authoring guide

Condensed from the Agent Skills specification and authoring guides
(agentskills.io, Anthropic's skill best practices). Read once; use the checklist every time.

## 1. How skills load (why the rules exist)

| Stage | What loads | Budget |
| --- | --- | --- |
| Discovery | `name` + `description` of every installed skill | ~100 tokens each |
| Activation | Full `SKILL.md` body | < 500 lines, < ~5k tokens |
| On demand | Files in `scripts/`, `references/`, `assets/` | only when instructed |

The **description carries the entire triggering burden**; the body competes for context
with everything else; extra files are free until read.

## 2. Description

- Say what it does **and** when to use it. Imperative: "Use this skill when …".
- Describe user intent, not implementation. Include the words users actually say.
- Be a bit pushy: "…even if they don't mention X." Under-triggering is the common failure.
- Add a boundary if it collides with a neighbour: "Not for Excel formula edits."
- Third person, no `<` `>`, ≤ 1024 chars (aim for 2–4 sentences).

## 3. Body

- **Only what the agent would get wrong without it.** Skip explaining what a PDF is.
- **Defaults, not menus.** "Use X. For scanned files use Y instead."
- **Match freedom to fragility.** Loose guidance + reasons for judgment calls; exact
  commands ("run exactly this; add no flags") for fragile/destructive steps.
- **Procedures over answers.** Teach the method for a class of tasks, not one instance.
- **Gotchas section** in `SKILL.md` — the highest-value content. Every manual correction
  you make becomes a gotcha.
- **Checklists** for multi-step work; **validation loops** (do → check → fix → recheck);
  **plan → validate → execute** for batch/destructive work.
- **Templates** for output formats (short inline, long in `assets/`).
- Say *when* to load each reference: "Read `references/errors.md` if the API returns non-200."
- References one level deep. Reference files > 100 lines get a table of contents.
- Consistent terminology; no time-sensitive phrasing ("as of 2025…").
- Explain *why* instead of ALL-CAPS MUST/NEVER — models generalise from reasons.

## 4. Scripts

- Bundle a script when evals show the agent re-inventing the same code each run.
- Non-interactive (hard requirement). Inputs via flags/env/stdin.
- `--help` with description, flags, examples, exit codes.
- JSON/CSV to stdout; progress to stderr. Bounded output (`--limit`, `--output FILE`).
- Errors state what was wrong, what was expected, what to try.
- Idempotent; `--dry-run` for side effects; explicit `--force` for destructive ops.
- Prefer stdlib; otherwise PEP 723 inline deps (`uv run scripts/x.py`) or pinned
  `npx pkg@ver` / `uvx pkg@ver`. Declare runtime needs in `compatibility`.

## 5. Portability

- Spec frontmatter only. No harness tool names, slash-command args, or harness memory files.
- Relative paths from the skill root. Don't assume network access; say so in
  `compatibility` if needed.
- Don't rely on subagents, parallel tools, or a specific UI being present — if a step
  benefits from them, phrase it as optional ("if you can run tasks in parallel, …").
- Test on every model tier you'll ship to: what's enough for a large model may be too
  terse for a small one.

## 6. Evaluate and iterate

1. Write 2–3 realistic eval prompts (casual, precise, edge case) in `evals/evals.json`.
2. Run each **with** and **without** the skill in a clean context; save outputs.
3. Add assertions after seeing outputs; grade with evidence; record tokens/time.
4. Drop assertions that pass in both; investigate ones that fail in both.
5. Feed failures + human feedback + transcripts back in; generalise, keep it lean.
6. Separately, tune the description against `evals/trigger_queries.json` (train split),
   select by validation split.

## Review checklist

- [ ] `name` matches directory; lowercase-hyphen; ≤ 64 chars
- [ ] `description` says what + when, includes trigger terms, ≤ 1024 chars
- [ ] Body < 500 lines; no generic advice the model already knows
- [ ] Gotchas section populated from real failures
- [ ] Every script/reference is mentioned in `SKILL.md` with *when* to use it
- [ ] Scripts: `--help`, non-interactive, structured stdout, exit codes, `--dry-run` if stateful
- [ ] No harness-specific terms or absolute paths (`python3 tools/validate.py --strict`)
- [ ] Evals exist and the skill beats the no-skill baseline
- [ ] Trigger rate acceptable on held-out queries
