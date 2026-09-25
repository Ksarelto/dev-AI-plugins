#!/usr/bin/env bash
# Not the Station 0 entry. generate-spec Station 0 is continue-spec.mjs.
# This script still scaffolds .spec/spec/spec-{timecode}_{slug}/ for a one-off folder.
# It emits a frozen UTC timecode and creates that folder (+ artifacts/) without
# touching existing runs.
#
# Usage:   new-run.sh <slug> [app-dir]
# Example: new-run.sh profile-management
#          new-run.sh invoice-approval .spec/spec
#
# Prints two lines to stdout:
#   TIMECODE=<YYYYMMDD-HHmmss>
#   RUN_DIR=<app-dir>/spec-<timecode>_<slug>
# generate-spec does not call this script.

set -euo pipefail

slug="${1:-}"
app_dir="${2:-.spec/spec}"

if [[ -z "$slug" ]]; then
  echo "usage: new-run.sh <slug> [app-dir]" >&2
  exit 2
fi

# kebab-case guard — fail loudly rather than create a malformed folder.
if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: slug must be kebab-case (got '$slug')" >&2
  exit 2
fi

timecode="$(date -u +%Y%m%d-%H%M%S)"
run_dir="${app_dir}/spec-${timecode}_${slug}"

if [[ -e "$run_dir" ]]; then
  echo "error: run dir already exists: $run_dir" >&2
  exit 1
fi

mkdir -p "${run_dir}/artifacts"

echo "TIMECODE=${timecode}"
echo "RUN_DIR=${run_dir}"
