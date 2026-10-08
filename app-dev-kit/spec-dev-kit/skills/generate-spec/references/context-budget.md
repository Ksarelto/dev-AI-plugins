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
- Cross-kit: never return a pasted spec to `orchestrate-frontend` or `orchestrate-app`. The envelope is the handoff.
- The orchestrator does **not** write artifacts. Specialists and the skill persist them.

## Intermediate Artifacts on Disk

```
.spec/spec/spec-{tc}_{slug}/artifacts/
  intake.json         ← extract-intake.mjs + skill judgement fields (Station 1)
  analysis.json       ← spec-analyst (overwritten per round)
  completeness-credits.json ← spec-completeness (category credits)
  completeness.json   ← score-completeness.mjs
  qa-log.md           ← skill, every AskUserQuestion round, appended (## Round {n})
  requirements.seed.json ← build-enriched.mjs --seed
  enriched.patch*.json   ← spec-enricher (edits + other sections)
  enriched.json       ← build-enriched.mjs merge
  prior-index.json    ← continue-spec.mjs
  prior-items.yaml    ← lookup-spec.mjs (modified ids only)
  coverage.yaml       ← synthesizer
  removed.yaml        ← synthesizer, continue runs
  changes.json        ← write-changes.mjs
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
PRIOR_INDEX                            # continue runs only; path, do not paste the parent spec
```

### Station 2a (spec-interrogator)
```
KIT_DIR, RUN_DIR
ANALYSIS_PATH: {RUN_DIR}/artifacts/analysis.json
ASK_GAPS: askable_gaps + open_conflicts from gate-check.mjs
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
PRIOR_INDEX                            # continue runs only
```

### Station 4 (spec-enricher)
```
KIT_DIR, RUN_DIR
ANALYSIS_PATH: {RUN_DIR}/artifacts/analysis.json
QA_LOG_PATH:   {RUN_DIR}/artifacts/qa-log.md
PRIOR_ITEMS:   {RUN_DIR}/artifacts/prior-items.yaml   # continue runs only
INTAKE_REPORT_PATH: {RUN_DIR}/artifacts/intake.json
SEED_PATH:     {RUN_DIR}/artifacts/requirements.seed.json   # build-enriched.mjs --seed
PATCH_OUT_PATH: {RUN_DIR}/artifacts/enriched.patch.json     # build-enriched.mjs merges it
```

Do **not** pass a separate `ASSUMPTIONS` field. It is already inside `enriched.json`.

### Station 5 (spec-completeness, then score-completeness.mjs)
```
KIT_DIR, RUN_DIR
ENRICHED_PATH: {RUN_DIR}/artifacts/enriched.json
CHECKLIST_PATH: {KIT_DIR}/skills/generate-spec/references/completeness-checklist.md
```
The agent writes `artifacts/completeness-credits.json`; the script reads intake + enriched + credits
and writes `artifacts/completeness.json`.

### Station 6 (spec-synthesizer)
```
KIT_DIR, RUN_DIR, TIMECODE, SLUG
ENRICHED_PATH: artifacts/enriched.json
INTAKE_REPORT_PATH: artifacts/intake.json
QA_LOG_PATH:   artifacts/qa-log.md
ANALYSIS_PATH: artifacts/analysis.json
CONTINUE, PRIOR_INDEX, PRIOR_ITEMS   # continue runs only
```

Pass **paths, not content**. Every run writes `{RUN_DIR}/spec.md` and `artifacts/coverage.yaml`. A continue run is feature-only (`metadata.parent-spec`).

### Station 7 (validate-spec.mjs)
```
Bash: node {KIT_DIR}/skills/generate-spec/scripts/validate-spec.mjs {RUN_DIR}/spec.md
```

On correction: `VALIDATION_ERRORS` = lines matching `^ERROR` only — not the whole spec.

### Station 8 (diagrams — no agent)
Drawn by `render-spec-views.mjs` in Station 9. No payload.

### Station 9 compose (compose-review.mjs — no agent)
```
Bash: node {KIT_DIR}/skills/generate-spec/scripts/compose-review.mjs {RUN_DIR}/spec.md --cycle {n}
```
Writes `artifacts/review-packet.md`; cycle 1+ reads `artifacts/review-changes.json`.

### Station 9 apply (spec-review-facilitator)
```
SPEC_PATH, RUN_DIR, CYCLE
USER_RESPONSE: this cycle's CHANGE_REQUEST only
```

## Size guards

Before spawning Station 4/6/9, estimate serialized payload size (paths do not count as content).

| Payload | Soft limit | Action on breach |
|---------|-----------|------------------|
| `qa-log.md` (if a worker must inline) | 15 KB | Keep verbatim only the two most recent rounds |
| `enriched.json` (if accidentally inlined) | 30 KB | Do not inline — pass the path |
| `spec.md` front matter | 2,500 lines | `SPEC_TOO_LARGE` warning — the register belongs in `requirements.yaml`; never escalate on size alone |

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
