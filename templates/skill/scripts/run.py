#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""Template helper script for an agent skill.

Agent-friendly conventions this file demonstrates:
  * Never prompts interactively; every input is a flag, env var, or stdin.
  * --help is the interface documentation the agent reads.
  * Structured JSON on stdout; progress/diagnostics on stderr.
  * Distinct, documented exit codes.
  * --dry-run for anything stateful; idempotent when re-run.
  * Bounded output size (--limit) so harness truncation never hides results.
  * Errors say what was wrong, what was expected, and what to try next.

Stdlib only by default. If you add dependencies, list them in the PEP 723
block above and run with `uv run scripts/run.py` (or `pipx run`).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_NOT_FOUND = 3
EXIT_CHECK_FAILED = 4


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def emit(obj: object) -> None:
    json.dump(obj, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


def fail(code: int, message: str, hint: str | None = None) -> "NoReturn":  # type: ignore[name-defined]
    emit({"ok": False, "error": message, **({"hint": hint} if hint else {})})
    sys.exit(code)


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="scripts/run.py",
        description="<One line: what this script does.>",
        epilog=(
            "exit codes: 0 ok | 2 bad arguments | 3 input not found | 4 check failed\n\n"
            "examples:\n"
            "  python3 scripts/run.py --input data.csv --dry-run\n"
            "  python3 scripts/run.py --input data.csv --output out.json\n"
            "  python3 scripts/run.py --check out.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--input", type=Path, help="file to process")
    mode.add_argument("--check", type=Path, metavar="FILE", help="validate FILE and exit")
    p.add_argument("--output", type=Path, help="write result to FILE (default: stdout)")
    p.add_argument("--dry-run", action="store_true", help="report what would happen; change nothing")
    p.add_argument("--limit", type=int, default=50, help="max items to print (default: 50)")
    return p.parse_args(argv)


def process(path: Path, limit: int) -> dict:
    # Replace with real logic.
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return {
        "ok": True,
        "input": str(path),
        "line_count": len(lines),
        "preview": lines[:limit],
        "truncated": len(lines) > limit,
    }


def check(path: Path) -> dict:
    # Replace with real validation. Report every problem, not just the first.
    problems: list[str] = []
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        problems.append(f"not valid JSON: {e.msg} at line {e.lineno} col {e.colno}")
    return {"ok": not problems, "file": str(path), "problems": problems}


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if args.check:
        if not args.check.is_file():
            fail(EXIT_NOT_FOUND, f"file not found: {args.check}", "pass the path of the output to validate")
        result = check(args.check)
        emit(result)
        return EXIT_OK if result["ok"] else EXIT_CHECK_FAILED

    if not args.input.is_file():
        fail(EXIT_NOT_FOUND, f"input not found: {args.input}", "check the path; it is resolved from the current directory")
    if args.limit < 1:
        fail(EXIT_USAGE, f"--limit must be >= 1, got {args.limit}")

    log(f"processing {args.input}")
    result = process(args.input, args.limit)

    if args.dry_run:
        result["dry_run"] = True
        emit(result)
        return EXIT_OK

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)  # idempotent
        args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
        emit({"ok": True, "wrote": str(args.output)})
    else:
        emit(result)
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
