#!/usr/bin/env bash
# Install skills into one or more agent harnesses by symlink (or copy).
#
# usage:
#   tools/install.sh [--scope user|project] [--project-dir DIR] [--copy] [--dry-run] [--force]
#                    [--harness NAME ...] [SKILL_DIR ...]
#
#   --harness  one of: agents claude codex copilot gemini cursor opencode all
#              (default: agents — the cross-tool .agents/skills convention)
#   SKILL_DIR  defaults to every directory under ./skills containing SKILL.md
#
# Paths below reflect each harness's documented skills location at time of
# writing. Harnesses move fast — verify against your tool's docs and edit the
# table if needed. Idempotent: re-running replaces links it created; an existing
# real directory of the same name is left alone unless --force is given.
# Exit codes: 0 ok, 2 bad arguments.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="user"; PROJECT_DIR="$PWD"; MODE="link"; DRY=0; FORCE=0
HARNESSES=(); SKILLS=()

project_path() {  # harness -> path relative to project root
  case "$1" in
    agents|codex) echo ".agents/skills" ;;
    claude)       echo ".claude/skills" ;;
    copilot)      echo ".github/skills" ;;
    gemini)       echo ".gemini/skills" ;;
    cursor)       echo ".cursor/skills" ;;
    opencode)     echo ".opencode/skills" ;;
    *) return 1 ;;
  esac
}
user_path() {  # harness -> absolute user-level path
  case "$1" in
    agents)   echo "$HOME/.agents/skills" ;;
    codex)    echo "${CODEX_HOME:-$HOME/.codex}/skills" ;;
    claude)   echo "$HOME/.claude/skills" ;;
    copilot)  echo "$HOME/.copilot/skills" ;;
    gemini)   echo "$HOME/.gemini/skills" ;;
    cursor)   echo "$HOME/.cursor/skills" ;;
    opencode) echo "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skills" ;;
    *) return 1 ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --copy) MODE="copy"; shift ;;
    --dry-run) DRY=1; shift ;;
    --force) FORCE=1; shift ;;
    --harness) HARNESSES+=("$2"); shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    -*) echo "error: unknown flag $1 (see --help)" >&2; exit 2 ;;
    *) SKILLS+=("$1"); shift ;;
  esac
done

[[ "$SCOPE" == user || "$SCOPE" == project ]] || { echo "error: --scope must be user or project" >&2; exit 2; }
[[ ${#HARNESSES[@]} -eq 0 ]] && HARNESSES=(agents)
if [[ " ${HARNESSES[*]} " == *" all "* ]]; then HARNESSES=(agents claude codex copilot gemini cursor opencode); fi
if [[ ${#SKILLS[@]} -eq 0 ]]; then
  while IFS= read -r f; do SKILLS+=("$(dirname "$f")"); done < <(find "$ROOT/skills" -mindepth 2 -maxdepth 2 -name SKILL.md | sort)
fi
[[ ${#SKILLS[@]} -gt 0 ]] || { echo "error: no skills found" >&2; exit 2; }

run() { if [[ $DRY -eq 1 ]]; then echo "[dry-run] $*"; else "$@"; fi; }

seen="|"  # destinations already handled (plain string: works on bash 3.2)
for h in "${HARNESSES[@]}"; do
  if [[ "$SCOPE" == project ]]; then
    rel="$(project_path "$h")" || { echo "error: unknown harness '$h'" >&2; exit 2; }
    dest="$PROJECT_DIR/$rel"
  else
    dest="$(user_path "$h")" || { echo "error: unknown harness '$h'" >&2; exit 2; }
  fi
  [[ "$seen" == *"|$dest|"* ]] && continue; seen="$seen$dest|"
  run mkdir -p "$dest"
  for s in "${SKILLS[@]}"; do
    src="$(cd "$s" && pwd)"; name="$(basename "$src")"
    [[ -f "$src/SKILL.md" ]] || { echo "skip: $s has no SKILL.md" >&2; continue; }
    target="${dest:?}/$name"
    if [[ -L "$target" ]]; then run rm -f "$target"
    elif [[ -e "$target" ]]; then
      if [[ $FORCE -eq 1 ]]; then run rm -rf "$target"
      else echo "skip: $target exists and is not a symlink (use --force to replace)" >&2; continue; fi
    fi
    if [[ "$MODE" == link ]]; then run ln -s "$src" "$dest/$name"; else run cp -R "$src" "$dest/$name"; fi
    echo "$h: $dest/$name"
  done
done
