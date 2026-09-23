#!/usr/bin/env bash
# One commit for one feature. The tree is clean when the feature starts, so the
# worktree diff is this feature (src, lockfile, blackboard). Stages it for review.
# Does not push. Does not commit secret files. Does not run when the index is empty.
#
# Usage: commit-feature.sh <slug> [--stage-only]
#   --stage-only  git add the feature paths and stop (review the index; do not commit)
# Prints: STAGED=true|false and, unless --stage-only, COMMITTED=true|false

set -euo pipefail

slug=""
stage_only=false
for arg in "$@"; do
  case "$arg" in
    --stage-only) stage_only=true ;;
    *) slug="$arg" ;;
  esac
done

if [[ -z "$slug" ]]; then
  echo "usage: commit-feature.sh <slug> [--stage-only]" >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not inside a git work tree" >&2
  exit 2
fi

git add -A -- . \
  ':(exclude).env' \
  ':(exclude).env.*' \
  ':(exclude)**/.env' \
  ':(exclude)**/.env.*' \
  ':(exclude)**/credentials.json' \
  ':(exclude)**/*.pem'
git reset -q -- .env .env.* credentials.json 2>/dev/null || true

if git diff --cached --quiet; then
  echo "STAGED=false"
  if [[ "$stage_only" == false ]]; then
    echo "COMMITTED=false"
  fi
  exit 0
fi

echo "STAGED=true"
if [[ "$stage_only" == true ]]; then
  exit 0
fi

git commit -m "$(cat <<EOF
[${slug}] Add ${slug}

EOF
)"

echo "COMMITTED=true"
