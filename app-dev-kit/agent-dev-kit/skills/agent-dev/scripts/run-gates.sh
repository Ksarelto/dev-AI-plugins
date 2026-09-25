#!/usr/bin/env bash
# Mechanical agent gates. Failures → .spec/.gate-log, not stdout.
# Usage: run-gates.sh [--log <path>]
# eval is optional: a missing script is skip. types, lint, and test are required.
set -uo pipefail

log=".spec/.gate-log"
if [[ "${1:-}" == "--log" ]]; then
  log="${2:-$log}"
fi

pm_bin() {
  if [[ -f pnpm-lock.yaml ]]; then echo pnpm
  elif [[ -f yarn.lock ]]; then echo yarn
  else echo npm
  fi
}

has_script() {
  node --input-type=module -e '
    import { existsSync, readFileSync } from "node:fs"
    if (!existsSync("package.json")) process.exit(1)
    const pkg = JSON.parse(readFileSync("package.json", "utf8"))
    process.exit(pkg.scripts && Object.hasOwn(pkg.scripts, process.argv[1]) ? 0 : 1)
  ' "$1"
}

run_script() {
  local name="$1"
  case "$(pm_bin)" in
    pnpm) pnpm run "$name" ;;
    yarn) yarn run "$name" ;;
    *)    npm run "$name" ;;
  esac
}

mkdir -p "$(dirname "$log")"
: > "$log"
results=()
overall=0

for gate in types lint test eval; do
  start=$(date +%s)
  case "$gate" in
    types) cmd_name="typecheck" ;;
    lint)  cmd_name="lint" ;;
    test)  cmd_name="test" ;;
    eval)  cmd_name="eval" ;;
  esac
  if ! has_script "$cmd_name"; then
    if [[ "$gate" == "eval" ]]; then
      status="skip"
    else
      status="fail"
      overall=1
      echo "missing package.json script: $cmd_name" >> "$log"
    fi
  elif run_script "$cmd_name" >"${log}.${gate}" 2>&1; then
    status="pass"
  elif [[ "$gate" == "eval" ]]; then
    status="skip"
  else
    status="fail"
    overall=1
    cat "${log}.${gate}" >> "$log"
  fi
  dur=$(( $(date +%s) - start ))
  results+=("{\"gate\":\"${gate}\",\"status\":\"${status}\",\"duration_s\":${dur}}")
done

printf '{"passed":%s,"gates":[%s]}\n' "$([[ $overall -eq 0 ]] && echo true || echo false)" "$(IFS=,; echo "${results[*]}")"
exit "$overall"
