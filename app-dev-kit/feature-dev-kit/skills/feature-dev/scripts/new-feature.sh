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
#   BASE=<base branch>
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

# Refuse to scaffold on top of uncommitted work — a mid-run rebase is unrecoverable.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty; commit or stash before starting a feature run" >&2
  exit 1
fi

base="$(git rev-parse --abbrev-ref HEAD)"
# Resuming from the feature branch itself: fall back to the first integration branch that exists.
if [[ "$base" == feature/* ]]; then
  for candidate in develop main master; do
    if git show-ref --verify --quiet "refs/heads/${candidate}"; then
      base="$candidate"
      break
    fi
  done
fi

if [[ -n "$ticket" ]]; then
  branch="feature/${ticket}-${slug}"
else
  branch="feature/${slug}"
fi

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  git checkout "$branch" >&2
else
  git checkout -b "$branch" >&2
fi

mkdir -p "$features_dir"
spec_path="${features_dir}/${slug}.md"
created=false

if [[ ! -f "$spec_path" ]]; then
  today="$(date -u +%Y-%m-%d)"
  sed \
    -e "s|<feature-slug>|${slug}|" \
    -e "s|<YYYY-MM-DD>|${today}|" \
    -e "s|<TICKET-ID or TBD>|${ticket:-TBD}|" \
    -e "s|<feature/…>|${branch}|" \
    "$template" > "$spec_path"
  created=true
fi

echo "SLUG=${slug}"
echo "BRANCH=${branch}"
echo "BASE=${base}"
echo "SPEC_PATH=${spec_path}"
echo "CREATED=${created}"
