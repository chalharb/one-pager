---
name: {{name}}
description: >-
  {{description}}
license: {{license}}
metadata:
  version: "0.1.0"
  author: "{{author}}"
---

# {{title}}

<!--
AUTHORING NOTES — delete this comment block before shipping.

Portability rules (keep the skill model/harness agnostic):
- Only use spec frontmatter: name, description, license, compatibility, metadata,
  allowed-tools (experimental; omit unless you need it). Harness-specific keys
  belong in a harness overlay, not here.
- Say "run", "read", "write" — never name a harness's tools ("the Bash tool").
- All paths are relative to this skill's root. Commands run from the skill root.
- Scripts must be non-interactive, support --help, print data to stdout and
  diagnostics to stderr.
- Budget: this body < 500 lines / ~5k tokens. Push detail into references/.
- Only write what the agent would get wrong without being told.
-->

## When to use

Use this skill when <the user intent this serves>. Do not use it for
<nearest neighbouring task that should go elsewhere>.

## Quick start

The default path that handles most requests:

1. <First concrete step.>
2. Run the helper and inspect its JSON output:
   ```bash
   python3 scripts/run.py --input <path> --dry-run
   ```
3. If the dry run looks right, rerun without `--dry-run`.
4. Validate before finishing (see [Validation loop](#validation-loop)).

## Workflow

Copy this checklist and tick items off as you go:

```
- [ ] 1. Gather inputs (<what, from where>)
- [ ] 2. Plan: write the intended changes to plan.json
- [ ] 3. Validate the plan: python3 scripts/run.py --check plan.json
- [ ] 4. Execute
- [ ] 5. Verify output against the template in assets/output-template.md
```

## Gotchas

<!-- The highest-value section. Add every correction you had to make by hand. -->
- <Environment fact that defies a reasonable assumption.>
- <Name/ID that differs between systems.>

## Validation loop

1. Produce the output.
2. Run `python3 scripts/run.py --check <output>`.
3. On failure, read the error (it names the problem and the fix), correct, rerun.
4. Finish only when the check exits 0.

## Output format

Use the template in `assets/output-template.md`. Read it only when producing
the final deliverable.

## References — load only when needed

- Read `references/REFERENCE.md` when <specific trigger, e.g. "the API returns a
  non-200 status" or "the input uses the legacy format">.

## Available scripts

- `scripts/run.py` — <one-line purpose>. Run `python3 scripts/run.py --help` for flags.
  Exit codes: 0 ok, 2 bad arguments, 3 input not found, 4 check failed.
