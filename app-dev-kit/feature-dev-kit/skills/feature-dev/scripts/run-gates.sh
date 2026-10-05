#!/usr/bin/env bash
# Run the deterministic quality-gate sequence and emit one JSON object.
# Run by feature-orchestrator via Bash so gate results are a fact, not a judgement.
# Gate order and thresholds are owned by ../references/quality-gates.md.
#
# Usage:   run-gates.sh [--from <gate>] [--until <gate>] [--only <gate>] [--log <path>] [--base <ref>]
#                       [--spec <blackboard.md> --station <label>]
#   --from   start at this gate, skipping earlier ones (default: types)
#   --until  stop after this gate, even when it passed (layer profile: --until fsd)
#   --only   run exactly one gate (cannot combine with --from or --until)
#   --log    write full output of failing gates here (default: .spec/.gate-log)
#   --base   integration ref; the conventions gate also checks files changed since it
#   --spec   append one row to the blackboard's `## Gate Log` table (--station labels it)
#
# Gates, in order: types · lint · fsd · conventions · build · coverage
# `conventions` runs the sibling check-conventions.mjs (no package.json script needed).
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
    echo "node \"$SCRIPT_DIR/check-conventions.mjs\"${base_ref:+ --base \"$base_ref\"}"
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) from="${2:-}"; shift 2 ;;
    --until) until="${2:-}"; shift 2 ;;
    --only) only="${2:-}"; shift 2 ;;
    --log)  log="${2:-}";  shift 2 ;;
    --base) base_ref="${2:-}"; shift 2 ;;
    --spec) spec="${2:-}"; shift 2 ;;
    --station) station="${2:-}"; shift 2 ;;
    *) echo "usage: run-gates.sh [--from <gate>] [--until <gate>] [--only <gate>] [--log <path>] [--base <ref>] [--spec <md> --station <label>]" >&2; exit 2 ;;
  esac
done

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

if [[ -n "$spec" ]]; then
  printf -v joined '%s, ' ${ran[@]+"${ran[@]}"}
  row="| $(date -u +%Y-%m-%dT%H:%M:%SZ) | ${station:-—} | ${joined%, } | $([[ $overall -eq 0 ]] && echo PASS || echo FAIL) | ${failed_gate:+${failed_gate} failed — see ${log}} |"
  node --input-type=module -e '
    import { existsSync, readFileSync, writeFileSync } from "node:fs"
    const [spec, row] = process.argv.slice(1)
    let s = existsSync(spec) ? readFileSync(spec, "utf8") : ""
    const i = s.indexOf("\n## Gate Log")
    if (i < 0) {
      s = s.replace(/\s*$/, "\n\n## Gate Log\n\n| Timestamp | Station | Gate | Result | Note |\n|-----------|---------|------|--------|------|\n" + row + "\n")
    } else {
      const next = s.indexOf("\n## ", i + 1)
      const end = next < 0 ? s.length : next
      s = s.slice(0, end).replace(/\s*$/, "") + "\n" + row + "\n" + s.slice(end)
    }
    writeFileSync(spec, s)
  ' "$spec" "$row"
fi

printf '{"passed":%s,"log":"%s","gates":[%s]}\n' \
  "$([[ $overall -eq 0 ]] && echo true || echo false)" \
  "$log" \
  "$(IFS=,; echo "${results[*]}")"

exit $overall
