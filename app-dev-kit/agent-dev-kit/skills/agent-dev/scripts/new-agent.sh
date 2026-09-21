#!/usr/bin/env bash
# Scaffold an agent increment: slug, branch, blackboard template.
# Usage: new-agent.sh <slug> [agents-dir]
set -euo pipefail

slug="${1:-}"
agents_dir="${2:-.spec/agents}"
kit_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="${kit_dir}/templates/agent-spec.md"

if [[ -z "$slug" ]]; then
  echo "usage: new-agent.sh <slug> [agents-dir]" >&2
  exit 2
fi
if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: slug must be kebab-case (got '$slug')" >&2
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
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty; commit or stash before starting" >&2
  exit 1
fi

base="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$base" == agent/* || "$base" == feature/* || "$base" == backend/* ]]; then
  for candidate in develop main master; do
    if git show-ref --verify --quiet "refs/heads/${candidate}"; then
      base="$candidate"
      break
    fi
  done
fi

branch="agent/${slug}"
if git show-ref --verify --quiet "refs/heads/${branch}"; then
  git checkout "$branch" >&2
else
  git checkout -b "$branch" >&2
fi

mkdir -p "$agents_dir"
spec_path="${agents_dir}/${slug}.md"
created=false
if [[ ! -f "$spec_path" ]]; then
  today="$(date -u +%Y-%m-%d)"
  sed \
    -e "s|<agent-slug>|${slug}|g" \
    -e "s|<YYYY-MM-DD>|${today}|g" \
    -e "s|<agent/…>|${branch}|g" \
    "$template" > "$spec_path"
  created=true
fi

echo "SLUG=${slug}"
echo "BRANCH=${branch}"
echo "BASE=${base}"
echo "SPEC_PATH=${spec_path}"
echo "CREATED=${created}"
