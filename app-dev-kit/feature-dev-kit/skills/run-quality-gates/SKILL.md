---
name: run-quality-gates
description: Wrap typecheck → lint → FSD-boundary → build → coverage into one structured pass/fail gate, returning only failures with remediation hints. Use between build stations to block progression.
argument-hint: "[--stage <layer>]"
disable-model-invocation: false
allowed-tools: [Bash, Read, Grep]
---

# Run Quality Gates

## When to use

Station 9 runs the full sweep. After each layer, and on a patch run, stop at FSD (`--until fsd`). A fix re-runs the failed gate plus types. Used by `quality-gate-runner`. This skill reports only — it never fixes. Write the result to the handoff file. Do not paste the transcript.

## Fast path

When the kit is installed, run the whole sequence in one call instead of stepping through it:

```bash
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh                 # Station 9 full sweep
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --until fsd       # layer gate and patch
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --only types       # fix loop
bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --from lint
```

It emits one JSON line (`{"passed":…,"log":…,"gates":[…]}`) and writes the failing gate's full
output to the log file — read the log only for the gate that failed. Fall back to the manual steps
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

4. **Run build**:
   ```bash
   yarn build
   ```
   Pass condition: Vite build exits 0. On failure: extract the Vite error (missing module, circular dep, etc.). Stop here and report if failed.

5. **Run tests with coverage**:
   ```bash
   yarn test:auto
   ```
   Pass condition: all tests pass AND coverage report shows branches ≥73%, functions ≥78%, lines ≥87%, statements ≥86%. On failure: if tests fail, extract failing test names + assertion diff. If only coverage fails, extract the specific metric(s) below threshold and the files with the lowest coverage.

6. **Format the report** — include ONLY failures. If all gates pass, the report is one line:
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

7. **Append to spec gate log** at `## Gate Log`:
   ```
   [2026-07-09T14:32:00Z] Station 9 — PASSED|FAILED: <gate name>
     Gates run: typecheck, lint, fsd-boundary, build, test:auto
     Result: PASS|FAIL
     Failures: none | <list>
   ```

## Pre-conditions

- The feature build is complete for the current layer group.
- `yarn.lock` is committed (no dangling installs).

## Outputs

- Pass/fail report with trimmed failure details for each failed gate.
- Timestamped entry appended to the spec's `## Gate Log` section.

## What this skill does NOT do

- Does not fix any errors.
- Does not modify source files.
- Does not re-run gates after a fix — that is the orchestrator's job.
- Does not skip any gate in the sequence.
