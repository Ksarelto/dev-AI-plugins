#!/usr/bin/env bash
# SessionStart: install this plugin's own node_modules (yaml, playwright-core, axe-core) when a
# copied/installed plugin has none. Never downloads a browser binary — that's a separate, much
# larger download `npx playwright install chromium` is responsible for, run only when a human
# explicitly asks for it (see verification-protocol.md). A failure here (offline, read-only
# install, etc.) must not break the session — it degrades to the static-only verification path.
set -uo pipefail
root="${CLAUDE_PLUGIN_ROOT:-}"
if [[ -z "$root" ]]; then
  root="$(cd "$(dirname "$0")/.." && pwd)"
fi
if [[ ! -f "$root/package.json" ]]; then
  echo "WARN: $root has no package.json — skipping dependency install." >&2
  exit 0
fi
if [[ -f "$root/node_modules/yaml/package.json" && -f "$root/node_modules/playwright-core/package.json" && -f "$root/node_modules/axe-core/package.json" ]]; then
  exit 0
fi
if ! npm install --omit=dev --prefix "$root"; then
  echo "WARN: dependency install failed (offline, or no write access to $root/node_modules)." >&2
  echo "WARN: the render/functionality check will fall back to static-only verification until this is resolved." >&2
fi
exit 0
