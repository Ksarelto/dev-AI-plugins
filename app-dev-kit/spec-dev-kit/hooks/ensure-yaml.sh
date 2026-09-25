#!/usr/bin/env bash
# SessionStart: install this plugin's yaml dependency when a copied plugin has none.
set -euo pipefail
root="${CLAUDE_PLUGIN_ROOT:-}"
if [[ -z "$root" ]]; then
  root="$(cd "$(dirname "$0")/.." && pwd)"
fi
if [[ -f "$root/node_modules/yaml/package.json" ]]; then
  exit 0
fi
if [[ ! -f "$root/package.json" ]]; then
  echo "FATAL: $root has no package.json, so yaml cannot be installed." >&2
  exit 1
fi
npm install --omit=dev --prefix "$root"
