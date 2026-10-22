#!/usr/bin/env bash
# Run the deterministic quality-gate sequence and emit one JSON object.
# Run by feature-orchestrator via Bash so gate results are a fact, not a judgement.
# Gate order and thresholds are owned by ../references/quality-gates.md.
#
# Usage:   run-gates.sh [--from <gate>] [--until <gate>] [--only <gate>] [--log <path>] [--base <ref>]
#                       [--spec <blackboard.md> --station <label>]
#                       [--fix <comma-separated files>]
#   --from   start at this gate, skipping earlier ones (default: types)
#   --until  stop after this gate, even when it passed (layer profile: --until fsd)
#   --only   run exactly one gate (cannot combine with --from or --until)
#   --log    write full output of failing gates here (default: .spec/.gate-log)
#   --base   integration ref; the conventions gate also checks files changed since it
#   --spec   record each gate in <slug>.context/gate-log.jsonl + gate-status.md (--station labels it);
#            the blackboard itself is not written
#
# Gates, in order: types · lint · fsd · conventions · build · coverage
# `conventions` runs check-conventions.mjs, then scan-duplicates.mjs.
# Exits 0 when every executed gate passed, 1 otherwise, 2 on usage error.
#
# Output (stdout, last line): {"passed":bool,"gates":[{"gate","command","status","duration_s"}...]}
# Failing gate output is written to the log file — never echoed to stdout, so the
# agent's context does not absorb a full build transcript.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATES=(types lint fsd conventions build coverage)

script_for() {
  case "$1" in
    types)       echo "typecheck" ;;
    lint)        echo "lint" ;;
    fsd)         echo "lint:fsd" ;;
    conventions) echo "@kit:check-conventions" ;;
    build)       echo "build" ;;
    coverage)    echo "test:auto" ;;
    *)           echo "" ;;
  esac
}

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

cmd_for() {
  local script
  script="$(script_for "$1")"
  [[ -n "$script" ]] || { echo ""; return; }
  if [[ "$script" == "@kit:check-conventions" ]]; then
    local base_arg=""
    [[ -n "$base_ref" ]] && base_arg=" --base \"$base_ref\""
    echo "node \"$SCRIPT_DIR/check-conventions.mjs\"${base_arg} && node \"$SCRIPT_DIR/scan-duplicates.mjs\"${base_arg}"
    return
  fi
  case "$(pm_bin)" in
    pnpm) echo "pnpm run $script" ;;
    yarn) echo "yarn run $script" ;;
    *)    echo "npm run $script" ;;
  esac
}

from=""
until=""
only=""
log=".spec/.gate-log"
base_ref=""
spec=""
station=""
fix_files=""

has_dep() {
  node --input-type=module -e '
    import { existsSync, readFileSync } from "node:fs"
    if (!existsSync("package.json")) process.exit(1)
    const pkg = JSON.parse(readFileSync("package.json", "utf8"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    process.exit(Object.hasOwn(deps, process.argv[1]) ? 0 : 1)
  ' "$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) from="${2:-}"; shift 2 ;;
    --until) until="${2:-}"; shift 2 ;;
    --only) only="${2:-}"; shift 2 ;;
    --log)  log="${2:-}";  shift 2 ;;
    --base) base_ref="${2:-}"; shift 2 ;;
    --spec) spec="${2:-}"; shift 2 ;;
    --station) station="${2:-}"; shift 2 ;;
    --fix) fix_files="${2:-}"; shift 2 ;;
    *) echo "usage: run-gates.sh [--from <gate>] [--until <gate>] [--only <gate>] [--log <path>] [--base <ref>] [--spec <md> --station <label>] [--fix <files>]" >&2; exit 2 ;;
  esac
done

if [[ -n "$fix_files" ]]; then
  # Auto-fix only tools the host declared, and only the listed files. Never npx.
  IFS=',' read -ra fix_list <<< "$fix_files"
  ran_fix=false
  if has_script lint:fix; then
    case "$(pm_bin)" in
      pnpm) pnpm run lint:fix -- "${fix_list[@]}" ;;
      yarn) yarn run lint:fix "${fix_list[@]}" ;;
      *) npm run lint:fix -- "${fix_list[@]}" ;;
    esac
    ran_fix=true
  elif has_dep eslint && [[ -x node_modules/.bin/eslint ]]; then
    node_modules/.bin/eslint --fix "${fix_list[@]}"
    ran_fix=true
  fi
  if has_dep prettier && [[ -x node_modules/.bin/prettier ]]; then
    node_modules/.bin/prettier --write "${fix_list[@]}"
    ran_fix=true
  fi
  if [[ "$ran_fix" == false ]]; then
    echo SKIP
    exit 0
  fi
  echo FIXED
  exit 0
fi

if [[ -n "$only" && ( -n "$from" || -n "$until" ) ]]; then
  echo "error: --only cannot be combined with --from or --until" >&2
  exit 2
fi

for g in "$from" "$until" "$only"; do
  if [[ -n "$g" && -z "$(cmd_for "$g")" ]]; then
    echo "error: unknown gate '$g' (known: ${GATES[*]})" >&2
    exit 2
  fi
done

mkdir -p "$(dirname "$log")"
: > "$log"

results=()
ran=()
failed_gate=""
overall=0
started=false

for gate in "${GATES[@]}"; do
  if [[ -n "$only" && "$gate" != "$only" ]]; then continue; fi
  if [[ -n "$from" && "$started" == false ]]; then
    [[ "$gate" == "$from" ]] && started=true || continue
  fi

  command="$(cmd_for "$gate")"
  script="$(script_for "$gate")"
  start=$SECONDS

  if [[ "$script" != @kit:* ]] && ! has_script "$script"; then
    status=fail
    overall=1
    output="missing package.json script: $script"
  elif output="$(eval "$command" 2>&1)"; then
    status=pass
  else
    status=fail
    overall=1
  fi

  duration=$(( SECONDS - start ))
  results+=("{\"gate\":\"${gate}\",\"command\":\"${command//\"/\\\"}\",\"status\":\"${status}\",\"duration_s\":${duration}}")
  ran+=("$gate")

  if [[ "$status" == fail ]]; then
    failed_gate="$gate"
    {
      echo "===== GATE FAILED: ${gate} (${command}) ====="
      echo "$output"
      echo
    } >> "$log"
    # A failing gate blocks every later gate — later output would be noise from a known-bad tree.
    break
  fi

  if [[ -n "$until" && "$gate" == "$until" ]]; then
    break
  fi
done

summary="$(printf '{"passed":%s,"log":"%s","gates":[%s]}' \
  "$([[ $overall -eq 0 ]] && echo true || echo false)" \
  "$log" \
  "$(IFS=,; echo "${results[*]}")")"

# Gate results never go onto the blackboard: board.mjs appends <slug>.context/gate-log.jsonl and
# rewrites gate-status.md (latest per gate), so agents holding the board never see it change.
if [[ -n "$spec" ]]; then
  node "$SCRIPT_DIR/board.mjs" gate "$spec" --station "${station:-—}" --json "$summary" >/dev/null
fi

echo "$summary"

exit $overall
