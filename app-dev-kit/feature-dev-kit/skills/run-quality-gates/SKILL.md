---
name: run-quality-gates
description: Wrap typecheck → lint → FSD-boundary → conventions (missing tests, comments, hardcoded strings, unused exports, inline classes/handlers, JSX ternaries, magic props) → build → coverage into one structured pass/fail gate, returning only failures with remediation hints. Use between build stations to block progression.
argument-hint: "[--stage <layer>]"
disable-model-invocation: false
allowed-tools: [Bash, Read, Grep]
---

# Run Quality Gates

## When to use

Station 9 runs the full sweep. After each layer, stop at FSD (`--until fsd`). A patch run stops at conventions (`--until conventions`) after its Station 8 walk. A fix re-runs the failed gate plus types. The orchestrator runs the fast path directly via Bash. This skill reports only — it never fixes. Do not paste the transcript.

## Fast path

When the kit is installed, run the whole sequence in one call instead of stepping through it:

```bash
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --base <integration-ref>   # Station 9 full sweep
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --until fsd                # layer gate
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --until conventions        # patch
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --only conventions         # fix loop
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --from lint
```

It emits one JSON line (`{"passed":…,"log":…,"gates":[…]}`) and writes the failing gate's full
output to the log file — read the log only for the gate that failed. Add
`--spec <blackboard.md> --station "Station N"` and the script records each gate in
`<slug>.context/gate-status.md` (latest per gate) and `gate-log.jsonl` itself (step 8 is then done).
Gate results never go onto the blackboard. Fall back to the manual steps
below when the script is unavailable. Gate table of record:
`{KIT_DIR}/skills/feature-dev/references/quality-gates.md`. Architecture-audit is **not** this
script — Stations 1.5 / 9.5 spawn `architecture-auditor`.

## Steps

1. **Run TypeScript check**:
   ```bash
   yarn typecheck
   ```
   Pass condition: exit code 0, zero errors in output. On failure: extract all file + line + error message triples. Stop here and report if failed.

2. **Run ESLint + Stylelint**:
   ```bash
   yarn lint
   ```
   Pass condition: exit code 0, zero errors (warnings are allowed). On failure: extract each file + line + rule + message. Stop here and report if failed.

3. **Run FSD boundary lint**:
   ```bash
   yarn lint:fsd
   ```
   Pass condition: Steiger exits 0, no boundary violations reported. On failure: extract each violation as "source file → imported path (violation type)". Stop here and report if failed. If `yarn lint:fsd` is not yet configured, check for `eslint-plugin-boundaries` warnings in `yarn eslint` output instead.

4. **Run the conventions check** (kit script, not a package script):
   ```bash
   node {KIT_DIR}/skills/feature-dev/scripts/check-conventions.mjs --base <integration-ref>
   ```
   Pass condition: exit 0 (warnings allowed). Exit 1: list every `file:line rule message` line — do not summarize to a count. Exit 2: the TypeScript compiler API is not resolvable — report the setup failure; never treat it as a pass. Rules and remediation: `references/quality-gates.md` § Conventions.

5. **Run build**:
   ```bash
   yarn build
   ```
   Pass condition: Vite build exits 0. On failure: extract the Vite error (missing module, circular dep, etc.). Stop here and report if failed.

6. **Run tests with coverage**:
   ```bash
   yarn test:auto
   ```
   Pass condition: all tests pass AND coverage report shows branches ≥73%, functions ≥78%, lines ≥87%, statements ≥86%. On failure: if tests fail, extract failing test names + assertion diff. If only coverage fails, extract the specific metric(s) below threshold and the files with the lowest coverage.

7. **Format the report** — include ONLY failures. If all gates pass, the report is one line:
   ```
   ALL GATES PASSED
   ```
   If any gate failed, format as:
   ```
   GATE FAILED: <gate name>
   Command: <yarn command run>
   Failures:
     - <file>:<line>: <error message>  [<rule if lint>]
   Remediation: <hint from references/quality-gates.md>
   ```

8. **Record each gate** (not on the blackboard):
   ```bash
   node {KIT_DIR}/skills/feature-dev/scripts/board.mjs gate .spec/features/<slug>.md --station "Station 9" --gate <gate> --result pass|fail --note "<first failure, one line>"
   ```

## Pre-conditions

- The feature build is complete for the current layer group.
- `yarn.lock` is committed (no dangling installs).

## Outputs

- Pass/fail report with trimmed failure details for each failed gate.
- One entry per gate in `<slug>.context/gate-log.jsonl`; `gate-status.md` shows the latest result per gate.

## What this skill does NOT do

- Does not fix any errors.
- Does not modify source files.
- Does not re-run gates after a fix — that is the orchestrator's job.
- Does not skip any gate in the sequence.
