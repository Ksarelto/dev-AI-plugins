#!/usr/bin/env bash
# Scaffold a feature run: validate the slug, create the feature branch, and copy the
# blackboard template into .spec/features/<slug>.md with its front matter stamped.
# Idempotent for resume: an existing spec file is left untouched.
#
# Usage:   new-feature.sh <slug> [ticket] [features-dir]
# Example: new-feature.sh decline-profile
#          new-feature.sh decline-profile IV-1423
#
# Prints to stdout:
#   SLUG=<slug>
#   BRANCH=<feature/[ticket-]slug>
#   PARENT=<branch this one was cut from, or the branch checked out on resume>
#   BASE=<same as PARENT — the stack parent, not forced back to develop>
#   SPEC_PATH=<features-dir>/<slug>.md
#   CREATED=<true|false>   # false when resuming an existing spec

set -euo pipefail

slug="${1:-}"
ticket="${2:-}"
features_dir="${3:-.spec/features}"
kit_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="${kit_dir}/templates/feature-spec.md"

if [[ -z "$slug" ]]; then
  echo "usage: new-feature.sh <slug> [ticket] [features-dir]" >&2
  exit 2
fi

# kebab-case guard — fail loudly rather than create a malformed artifact set.
if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: slug must be kebab-case (got '$slug') — see references/artifact-naming.md" >&2
  exit 2
fi

if [[ ! -f "$template" ]]; then
  echo "error: template not found: $template" >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not inside a git work tree" >&2
  exit 2
fi

if [[ -n "$ticket" ]]; then
  branch="feature/${ticket}-${slug}"
else
  branch="feature/${slug}"
fi

mkdir -p "$features_dir"
spec_path="${features_dir}/${slug}.md"
head_now="$(git rev-parse --abbrev-ref HEAD)"

# A resume already on its feature branch keeps uncommitted src/ work. Stashing it would hide the build.
resuming=false
if [[ -f "$spec_path" ]] && git show-ref --verify --quiet "refs/heads/${branch}" && [[ "$head_now" == "$branch" ]]; then
  resuming=true
fi

# .spec is orchestrator state (often gitignored). It must not block a feature start.
# Refuse to scaffold on top of uncommitted src/ work — a mid-run rebase is unrecoverable.
if [[ "$resuming" == false && -n "$(git status --porcelain -- . ':(exclude).spec')" ]]; then
  echo "error: working tree is dirty; commit or stash before starting a feature run" >&2
  exit 1
fi

parent="$head_now"

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  git checkout "$branch" >&2
else
  # Cut from the current HEAD. A feature/* HEAD stacks the next feature on the previous one.
  git checkout -b "$branch" >&2
fi

created=false

if [[ ! -f "$spec_path" ]]; then
  today="$(date -u +%Y-%m-%d)"
  sed \
    -e "s|<feature-slug>|${slug}|" \
    -e "s|<YYYY-MM-DD>|${today}|" \
    -e "s|<TICKET-ID or TBD>|${ticket:-TBD}|" \
    -e "s|<feature/…>|${branch}|" \
    -e "s|<parent-branch>|${parent}|" \
    "$template" > "$spec_path"
  created=true
else
  # Resume must not report this branch as its own parent — scoped review would see an empty diff.
  board_parent="$(sed -n 's/^parent-branch:[[:space:]]*//p' "$spec_path" | head -1 | tr -d "'\"")"
  if [[ -z "$board_parent" || "$board_parent" == "none" || "$board_parent" == "<parent-branch>" ]]; then
    kit_result="${features_dir}/${slug}.kit-result.json"
    if [[ -f "$kit_result" ]]; then
      board_parent="$(sed -n 's/.*"parent_branch"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$kit_result" | head -1)"
    fi
  fi
  if [[ -n "$board_parent" && "$board_parent" != "none" && "$board_parent" != "$branch" ]]; then
    parent="$board_parent"
  elif [[ "$parent" == "$branch" ]]; then
    parent=""
  fi
fi

echo "SLUG=${slug}"
echo "BRANCH=${branch}"
echo "PARENT=${parent}"
echo "BASE=${parent}"
echo "SPEC_PATH=${spec_path}"
echo "CREATED=${created}"
