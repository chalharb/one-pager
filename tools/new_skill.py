#!/usr/bin/env python3
"""Create a new skill from templates/skill.

usage:
  python3 tools/new_skill.py <name> --description "Use this skill when ..." \
      [--title "Pretty Title"] [--author you] [--license MIT] [--dest skills] [--minimal]

--minimal creates only SKILL.md + evals/ (most good skills are a single file;
add scripts/, references/, assets/ when you actually need them).
Exit codes: 0 ok, 2 bad arguments, 5 destination exists.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "templates" / "skill"
MINIMAL = ROOT / "templates" / "SKILL.minimal.md"
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("name")
    p.add_argument("--description", required=True)
    p.add_argument("--title")
    p.add_argument("--author", default="")
    p.add_argument("--license", default="MIT")
    p.add_argument("--dest", type=Path, default=ROOT / "skills")
    p.add_argument("--minimal", action="store_true")
    a = p.parse_args()

    if len(a.name) > 64 or not NAME_RE.match(a.name):
        print(f"error: invalid name '{a.name}'. Use 1-64 chars of a-z, 0-9 and single hyphens, "
              "not starting/ending with a hyphen (e.g. 'pdf-processing').", file=sys.stderr)
        return 2
    if not (1 <= len(a.description) <= 1024):
        print(f"error: description must be 1-1024 chars (got {len(a.description)}).", file=sys.stderr)
        return 2

    dest = a.dest / a.name
    if dest.exists():
        print(f"error: {dest} already exists; pick another name or delete it.", file=sys.stderr)
        return 5

    ignore = None
    if a.minimal:
        ignore = shutil.ignore_patterns("scripts", "references", "assets")
    shutil.copytree(TEMPLATE, dest, ignore=ignore)
    if a.minimal:
        shutil.copyfile(MINIMAL, dest / "SKILL.md")

    subs = {
        "{{name}}": a.name,
        "{{description}}": a.description.replace("\n", " "),
        "{{title}}": a.title or a.name.replace("-", " ").title(),
        "{{author}}": a.author,
        "{{license}}": a.license,
    }
    for f in dest.rglob("*"):
        if f.is_file() and f.suffix in {".md", ".json", ".py", ".txt", ".yaml", ".yml"}:
            text = f.read_text(encoding="utf-8")
            for k, v in subs.items():
                text = text.replace(k, v)
            f.write_text(text, encoding="utf-8")
    if (dest / "scripts" / "run.py").exists():
        (dest / "scripts" / "run.py").chmod(0o755)


    print(f"created {dest}")
    print(f"next: edit {dest/'SKILL.md'}, then run: python3 tools/validate.py {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
