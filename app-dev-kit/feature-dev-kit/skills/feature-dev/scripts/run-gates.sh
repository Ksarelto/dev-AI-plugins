#!/usr/bin/env bash
# Run the deterministic quality-gate sequence and emit one JSON object.
# Used by quality-gate-runner so gate results are a fact, not a judgement.
# Gate order and thresholds are owned by ../references/quality-gates.md.
#
# Usage:   run-gates.sh [--from <gate>] [--until <gate>] [--only <gate>] [--log <path>]
#   --from   start at this gate, skipping earlier ones (default: types)
#   --until  stop after this gate, even when it passed (layer profile: --until fsd)
#   --only   run exactly one gate (cannot combine with --from or --until)
#   --log    write full output of failing gates here (default: .spec/.gate-log)
#
# Gates, in order: types · lint · fsd · build · coverage
# Exits 0 when every executed gate passed, 1 otherwise, 2 on usage error.
#
# Output (stdout, last line): {"passed":bool,"gates":[{"gate","command","status","duration_s"}...]}
# Failing gate output is written to the log file — never echoed to stdout, so the
# agent's context does not absorb a full build transcript.

set -uo pipefail

GATES=(types lint fsd build coverage)

cmd_for() {
  case "$1" in
    types)    echo "yarn typecheck" ;;
    lint)     echo "yarn lint" ;;
    fsd)      echo "yarn lint:fsd" ;;
    build)    echo "yarn build" ;;
    coverage) echo "yarn test:auto" ;;
    *)        echo "" ;;
  esac
}

from=""
until=""
only=""
log=".spec/.gate-log"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) from="${2:-}"; shift 2 ;;
    --until) until="${2:-}"; shift 2 ;;
    --only) only="${2:-}"; shift 2 ;;
    --log)  log="${2:-}";  shift 2 ;;
    *) echo "usage: run-gates.sh [--from <gate>] [--until <gate>] [--only <gate>] [--log <path>]" >&2; exit 2 ;;
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
overall=0
started=false

for gate in "${GATES[@]}"; do
  if [[ -n "$only" && "$gate" != "$only" ]]; then continue; fi
  if [[ -n "$from" && "$started" == false ]]; then
    [[ "$gate" == "$from" ]] && started=true || continue
  fi

  command="$(cmd_for "$gate")"
  start=$SECONDS

  if output="$(eval "$command" 2>&1)"; then
    status=pass
  else
    status=fail
    overall=1
  fi

  duration=$(( SECONDS - start ))
  results+=("{\"gate\":\"${gate}\",\"command\":\"${command}\",\"status\":\"${status}\",\"duration_s\":${duration}}")

  if [[ "$status" == fail ]]; then
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

printf '{"passed":%s,"log":"%s","gates":[%s]}\n' \
  "$([[ $overall -eq 0 ]] && echo true || echo false)" \
  "$log" \
  "$(IFS=,; echo "${results[*]}")"

exit $overall
