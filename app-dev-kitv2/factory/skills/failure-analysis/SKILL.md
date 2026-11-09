---
name: failure-analysis
description: Procedure the factory diagnostician agent follows to analyse repeated gate failures from gate logs, envelopes and diffs, classify the cause and write one recommended fix. Preloaded by the diagnostician; not for direct use.
user-invocable: false
---

# Root-cause diagnosis (escalation rung 3)

Runs on: diagnostician (opus) — root-causing a stage or task that keeps failing its gate (rung 3), read-only.

## Evidence to read, in order

1. T3 of your pack: the latest gate failures, progress signal and fingerprint.
2. `gate-log.jsonl` in the feature folder: every earlier result for the same gate. Look for the
   same fingerprint repeating (the agent keeps making the same mistake) or failures that move
   between files (oscillation).
3. `envelopes/` for the failing unit: what each attempt claimed it did, its deviations and questions.
4. The artifacts or files the failures point at. For code tasks, `git diff` of the task's files.
5. Re-run the failing check once yourself (the gate command from T0 of the original pack) to see
   the raw output.

## Classify the cause

| Class | Signal | Typical recommendation |
|---|---|---|
| Misread requirement | output contradicts an AC or the spec | quote the AC; say what to change |
| Missing input | the agent needed a file it was not given | name the file; the Conductor adds it |
| Unsatisfiable check | the gate demands something the spec forbids | fix the gate or the spec — escalate to a human |
| Task too large | failures spread across many files | amend (rung 4): the planner corrects the task; never propose a split yourself — a split only happens when a human runs `/factory:split` |
| Environment | tool, dependency or path problem | the exact command and error |

## Write `diagnosis/<stage-or-task>.md`

```markdown
# Diagnosis: <unit> (attempts <n>)
Root cause: <one sentence>
Class: <class from the table>
Evidence:
- <file:line or gate failure> — <what it shows>
Recommended fix: <specific, minimal, one approach>
Already tried (do not repeat):
- attempt 1: <approach> → <result>
Escalate to a human: yes | no — <why>
```

Keep it under 60 lines. Name files and IDs exactly; the next attempt reads this file first.
