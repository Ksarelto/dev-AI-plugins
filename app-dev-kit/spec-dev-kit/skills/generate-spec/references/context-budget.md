# Context Budget — spec-dev-kit

Applies to `spec-orchestrator` when spawning any sub-agent, and to the `generate-spec` skill when
relaying packets. Prevents token overflow on features with many clarification rounds or large
enriched requirements.

## Non-negotiables

- Every agent receives **only the fields it declares as inputs** — never the raw prior-stage report
  in full when a path exists.
- No field is ever passed twice in the same payload (see the `ASSUMPTIONS` duplicate rule below).
- The full Q&A log is never *inlined* into more than one prompt. The enricher reads
  `artifacts/qa-log.md` from disk. The synthesizer reads the same file from disk.
- The full spec lives on disk at `{RUN_DIR}/spec.md`. Downstream kits receive `SPEC_PATH` and
  `{RUN_DIR}/kit-result.json`, not the file contents.
- Cross-kit: never return a pasted spec to `orchestrate-app`. The envelope is the handoff.
- The orchestrator does **not** write artifacts. Specialists and the skill persist them.

## Intermediate Artifacts on Disk

```
.spec/app/spec-{tc}_{slug}/artifacts/
  intake.json         ← Station 1 (skill)
  analysis.json       ← spec-analyst (overwritten per round)
  completeness.json   ← spec-completeness
  qa-log.md           ← skill, every AskUserQuestion round, appended (## Round {n})
  enriched.json       ← spec-enricher
```

Rules:
- Downstream prompts pass **paths**, never file contents.
- These artifacts are intermediate state. The published deliverable is `spec.md`.

## Payload contracts

The orchestrator MUST assemble sub-agent prompts from exactly these fields — no others.

### Station 2 (spec-analyst)
```
KIT_DIR, RUN_DIR
INTAKE_REPORT_PATH: {RUN_DIR}/artifacts/intake.json
ANALYSIS_OUT_PATH:  {RUN_DIR}/artifacts/analysis.json
CONTEXT_FILE_PATHS: [.spec/context/*.md]   # paths only
```

### Station 2a (spec-interrogator)
```
KIT_DIR, RUN_DIR
ANALYSIS_PATH: {RUN_DIR}/artifacts/analysis.json
PRIOR_QA: last 3 Q&A entries only (not the full qa-log)
ROUND: current round number
```

### Station 2b (spec-analyst re-entry)
```
KIT_DIR, RUN_DIR
INTAKE_REPORT_PATH: unchanged
ANALYSIS_PATH: {RUN_DIR}/artifacts/analysis.json
ANALYSIS_OUT_PATH: same
NEW_ANSWERS: only answers from the latest AskUserQuestion — NOT the full qa-log
```

### Station 4 (spec-enricher)
```
KIT_DIR, RUN_DIR
ANALYSIS_PATH: {RUN_DIR}/artifacts/analysis.json
QA_LOG_PATH:   {RUN_DIR}/artifacts/qa-log.md
ENRICHED_OUT_PATH: {RUN_DIR}/artifacts/enriched.json
```

Do **not** pass a separate `ASSUMPTIONS` field. It is already inside `enriched.json`.

### Station 5 (spec-completeness)
```
KIT_DIR, RUN_DIR
ENRICHED_PATH: {RUN_DIR}/artifacts/enriched.json
COMPLETENESS_OUT_PATH: {RUN_DIR}/artifacts/completeness.json
CHECKLIST_PATH: {KIT_DIR}/skills/generate-spec/references/completeness-checklist.md
```

### Station 6 (spec-synthesizer)
```
KIT_DIR, RUN_DIR, TIMECODE, SLUG
ENRICHED_PATH: artifacts/enriched.json
QA_LOG_PATH:   artifacts/qa-log.md
ANALYSIS_PATH: artifacts/analysis.json
```

Pass **paths, not content**. The synthesizer writes `{RUN_DIR}/spec.md`.

### Station 7 (validate-spec.mjs)
```
Bash: node {KIT_DIR}/skills/generate-spec/scripts/validate-spec.mjs {RUN_DIR}/spec.md
```

On correction: `VALIDATION_ERRORS` = lines matching `^ERROR` only — not the whole spec.

### Station 8 (spec-diagram)
```
KIT_DIR, RUN_DIR
SPEC_PATH: {RUN_DIR}/spec.md
```

### Station 9 compose (spec-review-facilitator)
```
KIT_DIR, RUN_DIR
SPEC_PATH: {RUN_DIR}/spec.md
CYCLE: 0 for full summary; 1+ for delta only
```

### Station 9 apply / cycle 2+
```
SPEC_PATH
CHANGE_REQUEST / USER_RESPONSE: this cycle only
PRIOR_APPROVAL_STATE: which sections already approved
DELTA_SPEC: only sections that changed — never a full re-read
```

## Size guards

Before spawning Station 4/6/8/9, estimate serialized payload size (paths do not count as content).

| Payload | Soft limit | Action on breach |
|---------|-----------|------------------|
| `qa-log.md` (if a worker must inline) | 15 KB | Keep verbatim only the two most recent rounds |
| `enriched.json` (if accidentally inlined) | 30 KB | Do not inline — pass the path |
| `spec.md` | 60 KB | If exceeded before validation: `ESCALATION_PACKET` |

Log breaches into `open-questions[]` so downstream kits know a distillation happened.

## Anti-patterns

| Never | Why |
|---------|-----|
| Passing the previous stage's entire report "for context" | Doubles context on every hop |
| Duplicating `assumptions` outside `enriched.json` | Silent bloat |
| Re-presenting the full spec on review cycle 2+ | Defeats delta-only |
| Bundling multiple stages' outputs into one payload | Every payload is single-purpose |
| Orchestrator `Write` of spec.md or artifacts | Authority leak; workers + skill persist |
| Orchestrator `AskUserQuestion` | Subagent prompts never reach the user |
