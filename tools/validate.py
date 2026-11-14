#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""Validate Agent Skills against the agentskills.io specification plus
portability lint. Zero dependencies (uses PyYAML if installed).

usage:
  python3 tools/validate.py <skill-dir-or-skills-root> [...] [--strict] [--json]

Errors   = spec violations (skill may not load in some harnesses).
Warnings = best-practice / portability issues. --strict turns them into errors.
Exit codes: 0 ok, 1 errors found, 2 bad arguments.

For the canonical check also run:  skills-ref validate <skill-dir>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SPEC_FIELDS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)#\s]+)(?:#[^)]*)?\)")
PATH_RE = re.compile(r"(?<![\w/.-])((?:scripts|references|assets|evals)/[\w./-]+\w)")
# Phrases that tie a skill to one harness/model. Extend as needed.
HARNESS_TERMS = re.compile(
    r"\b(Bash tool|Read tool|Write tool|Edit tool|Task tool|TodoWrite|\$ARGUMENTS|"
    r"CLAUDE\.md|GEMINI\.md|\.claude/|\.codex/|\.gemini/|\.cursor/|"
    r"disable-model-invocation|user-invocable|context: fork)\b"
)
ABS_PATH_RE = re.compile(r"(?<![\w.])(/Users/|/home/|C:\\\\|~/)[\w./-]+")


def parse_frontmatter(text: str):
    if not text.startswith("---"):
        raise ValueError("SKILL.md must start with '---' YAML frontmatter")
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)$", text, re.S)
    if not m:
        raise ValueError("frontmatter is not closed with a '---' line")
    raw, body = m.group(1), m.group(2)
    try:
        import yaml  # type: ignore
        data = yaml.safe_load(raw) or {}
    except ImportError:
        data = _mini_yaml(raw)
    if not isinstance(data, dict):
        raise ValueError("frontmatter must be a YAML mapping")
    return data, body


def _mini_yaml(raw: str) -> dict:
    """Tiny fallback: top-level scalars, folded/literal blocks, one-level maps."""
    out: dict = {}
    lines = raw.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue
        k, _, v = line.partition(":")
        k, v = k.strip(), v.strip()
        i += 1
        block: list[str] = []
        while i < len(lines) and (lines[i].startswith((" ", "\t")) or not lines[i].strip()):
            block.append(lines[i])
            i += 1
        if v in {"", "|", ">", "|-", ">-", "|+", ">+"}:
            body = [b.strip() for b in block if b.strip()]
            if v == "" and body and all(":" in b for b in body):
                out[k] = {bk.strip(): bv.strip().strip("\"'") for bk, _, bv in (b.partition(":") for b in body)}
            else:
                out[k] = ("\n" if v.startswith("|") else " ").join(body)
        else:
            out[k] = v.strip("\"'")
    return out


def validate(skill_dir: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warns: list[str] = []
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        alt = [p.name for p in skill_dir.iterdir() if p.name.lower() == "skill.md"]
        hint = f" (found '{alt[0]}'; rename to exactly 'SKILL.md')" if alt else ""
        return [f"missing SKILL.md{hint}"], []

    text = skill_md.read_text(encoding="utf-8")
    try:
        fm, body = parse_frontmatter(text)
    except ValueError as e:
        return [str(e)], []

    # --- spec: fields -------------------------------------------------------
    unknown = set(fm) - SPEC_FIELDS
    if unknown:
        warns.append(f"non-spec frontmatter keys {sorted(unknown)} are harness-specific; "
                     "move them under metadata: or into a harness overlay")

    name = fm.get("name")
    if not isinstance(name, str) or not name:
        errors.append("name: required, non-empty string")
    else:
        if len(name) > 64:
            errors.append(f"name: max 64 chars (got {len(name)})")
        if not NAME_RE.match(name):
            errors.append(f"name: '{name}' must be lowercase a-z/0-9 with single hyphens, no leading/trailing hyphen")
        if name != skill_dir.name:
            errors.append(f"name: '{name}' must match directory name '{skill_dir.name}'")
        if re.search(r"claude|anthropic|openai|gemini|codex", name):
            warns.append(f"name: '{name}' contains a vendor word; some harnesses reject these")

    desc = fm.get("description")
    if not isinstance(desc, str) or not desc.strip():
        errors.append("description: required, non-empty string")
    else:
        if len(desc) > 1024:
            errors.append(f"description: max 1024 chars (got {len(desc)})")
        if len(desc) < 80:
            warns.append("description: very short; say what it does AND when to use it, with trigger keywords")
        if not re.search(r"\b(use|when|if)\b", desc, re.I):
            warns.append("description: add explicit trigger guidance ('Use this skill when ...')")
        if re.search(r"<|>|\{\{", desc):
            warns.append("description: contains angle brackets or unfilled {{placeholders}}")
        if re.search(r"\b(I|I'm|my)\b", desc):
            warns.append("description: avoid first person; it is injected into the agent's system context")

    comp = fm.get("compatibility")
    if comp is not None and (not isinstance(comp, str) or not (1 <= len(comp) <= 500)):
        errors.append("compatibility: must be a 1-500 char string if present")

    meta = fm.get("metadata")
    if meta is not None:
        if not isinstance(meta, dict):
            errors.append("metadata: must be a mapping of string -> string")
        else:
            bad = [k for k, v in meta.items() if not isinstance(v, str)]
            if bad:
                errors.append(f"metadata: values must be strings; quote these: {bad} (e.g. version: \"1.0\")")

    at = fm.get("allowed-tools")
    if at is not None:
        if not isinstance(at, str):
            errors.append("allowed-tools: must be a space-separated string")
        warns.append("allowed-tools is experimental and tool names differ per harness; omit for max portability")

    # --- best practice: size ------------------------------------------------
    n_lines = body.count("\n") + 1
    approx_tokens = len(body) // 4
    if n_lines > 500:
        warns.append(f"body is {n_lines} lines (>500); move detail into references/")
    if approx_tokens > 5000:
        warns.append(f"body is ~{approx_tokens} tokens (>5000 recommended); move detail into references/")

    # --- references resolve, stay one level deep ----------------------------
    referenced = set(LINK_RE.findall(body)) | set(PATH_RE.findall(body))
    for ref in sorted(referenced):
        if re.match(r"^[a-z]+://", ref) or ref.startswith("mailto:"):
            continue
        target = (skill_dir / ref).resolve()
        if not target.exists():
            errors.append(f"broken reference: '{ref}' does not exist")
        elif skill_dir.resolve() not in target.parents and target != skill_dir.resolve():
            errors.append(f"reference escapes the skill directory: '{ref}'")
    for ref_md in (skill_dir / "references").glob("*.md") if (skill_dir / "references").is_dir() else []:
        rtext = ref_md.read_text(encoding="utf-8")
        nested = [r for r in LINK_RE.findall(rtext) if r.startswith(("references/", "../")) or
                  (r.endswith(".md") and not re.match(r"^[a-z]+://", r))]
        if nested:
            warns.append(f"{ref_md.relative_to(skill_dir)} links to {nested}; keep references one level deep")
        if rtext.count("\n") > 100 and not re.search(r"^#+\s*(contents|table of contents)", rtext, re.I | re.M):
            warns.append(f"{ref_md.relative_to(skill_dir)} is >100 lines; add a table of contents")

    # --- portability lint ---------------------------------------------------
    scan = [skill_md] + [p for p in skill_dir.rglob("*.md") if p != skill_md and "evals" not in p.parts]
    for f in scan:
        t = f.read_text(encoding="utf-8")
        t = re.sub(r"<!--.*?-->", "", t, flags=re.S)  # ignore authoring comments
        for hit in sorted(set(HARNESS_TERMS.findall(t))):
            warns.append(f"{f.relative_to(skill_dir)}: harness-specific term '{hit}'")
        for hit in sorted(set(m.group(0) for m in ABS_PATH_RE.finditer(t))):
            warns.append(f"{f.relative_to(skill_dir)}: absolute path '{hit}'; use paths relative to the skill root")
        if re.search(r"\{\{\w+\}\}", t):
            warns.append(f"{f.relative_to(skill_dir)}: unfilled {{{{placeholder}}}}")

    # --- scripts ------------------------------------------------------------
    sdir = skill_dir / "scripts"
    if sdir.is_dir():
        for s in sdir.iterdir():
            if s.suffix in {".py", ".sh", ".js", ".ts", ".rb"}:
                st = s.read_text(encoding="utf-8", errors="replace")
                if re.search(r"\binput\(|\bread -p\b|readline\.question|getpass", st):
                    warns.append(f"scripts/{s.name}: looks interactive; agents can't answer prompts")
                if "--help" not in st and "argparse" not in st and "usage" not in st.lower():
                    warns.append(f"scripts/{s.name}: no --help/usage text; agents learn the interface from it")
            if s.name not in referenced and f"scripts/{s.name}" not in referenced and not s.name.startswith(("_", ".")):
                if s.is_file() and f"scripts/{s.name}" not in body:
                    warns.append(f"scripts/{s.name} is never mentioned in SKILL.md; the agent won't know it exists")

    # --- clutter ------------------------------------------------------------
    for junk in ("README.md", "CHANGELOG.md", "INSTALL.md", "node_modules", "__pycache__", ".DS_Store"):
        if (skill_dir / junk).exists():
            warns.append(f"'{junk}' inside the skill adds no value for the agent; keep it at repo level")

    return errors, warns


def find_skills(paths: list[Path]) -> list[Path]:
    found: list[Path] = []
    for p in paths:
        if (p / "SKILL.md").exists() or any(c.name.lower() == "skill.md" for c in p.iterdir() if p.is_dir()):
            found.append(p)
        elif p.is_dir():
            found += sorted(d for d in p.iterdir() if d.is_dir() and (d / "SKILL.md").exists())
    return found


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+", type=Path)
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    a = ap.parse_args()

    missing = [str(p) for p in a.paths if not p.exists()]
    if missing:
        print(f"error: path(s) not found: {missing}", file=sys.stderr)
        return 2
    skills = find_skills(a.paths)
    if not skills:
        print("error: no skill directories (containing SKILL.md) found", file=sys.stderr)
        return 2

    report, failed = [], False
    for s in skills:
        e, w = validate(s)
        bad = bool(e) or (a.strict and bool(w))
        failed |= bad
        report.append({"skill": str(s), "ok": not bad, "errors": e, "warnings": w})

    if a.json:
        print(json.dumps(report, indent=2))
    else:
        for r in report:
            print(f"{'PASS' if r['ok'] else 'FAIL'}  {r['skill']}")
            for e in r["errors"]:
                print(f"   error: {e}")
            for w in r["warnings"]:
                print(f"   warn:  {w}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
