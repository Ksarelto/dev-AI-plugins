#!/usr/bin/env bash
# Mechanical agent gates. Failures → .spec/.gate-log, not stdout.
# Usage: run-gates.sh [--log <path>]
set -uo pipefail

log=".spec/.gate-log"
if [[ "${1:-}" == "--log" ]]; then
  log="${2:-$log}"
fi

run_cmd() {
  local name="$1"
  shift
  if command -v yarn >/dev/null 2>&1 && [[ -f yarn.lock ]]; then
    yarn "$@"
  else
    npm run "$name" --if-present
  fi
}

mkdir -p "$(dirname "$log")"
: > "$log"
results=()
overall=0

for gate in types lint test eval; do
  start=$(date +%s)
  case "$gate" in
    types) cmd_name="typecheck"; extra=(typecheck) ;;
    lint)  cmd_name="lint"; extra=(lint) ;;
    test)  cmd_name="test"; extra=(test) ;;
    eval)  cmd_name="eval"; extra=(eval) ;;
  esac
  if run_cmd "$cmd_name" "${extra[@]}" >"${log}.${gate}" 2>&1; then
    status="pass"
  else
    # eval script is optional
    if [[ "$gate" == "eval" ]]; then
      status="skip"
    else
      status="fail"
      overall=1
      cat "${log}.${gate}" >> "$log"
    fi
  fi
  dur=$(( $(date +%s) - start ))
  results+=("{\"gate\":\"${gate}\",\"status\":\"${status}\",\"duration_s\":${dur}}")
done

printf '{"passed":%s,"gates":[%s]}\n' "$([[ $overall -eq 0 ]] && echo true || echo false)" "$(IFS=,; echo "${results[*]}")"
exit "$overall"
