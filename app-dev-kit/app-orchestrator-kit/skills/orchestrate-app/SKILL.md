---
name: orchestrate-app
description: Runs the full-stack app-dev-kit dispatcher — spec-dev-kit to author a spec, html-generator-kit to prototype it, then analyzes those outputs and calls backend-dev-kit, agent-dev-kit, and frontend-orchestrator-kit only when needed — tracked against a persisted, resumable work-plan. Use when starting or resuming a whole app/domain build that may include API, AI agents, and React screens. For a frontend-only screen-task loop use /orchestrate-frontend. For a single feature use /feature-dev. Cross-kit handoff is file paths and kit-result.json envelopes, never inlined spec or prototype bodies.
argument-hint: "[app-name or existing spec/work-plan slug]"
disable-model-invocation: true
allowed-tools: [Read, Glob, Grep, Write, Bash, Skill, AskUserQuestion]
---

# Orchestrate App

**Entry point for**: the app-dev-kit family as a whole (spec → prototype → backend / agent / frontend)
**Delegates to**: `spec-dev-kit:generate-spec`, `html-generator-kit:generate-html`,
`backend-dev-kit:backend-dev`, `agent-dev-kit:agent-dev`,
`frontend-orchestrator-kit:orchestrate-frontend`
**State file**: `.spec/app/spec-{tc}_{slug}/work-plan.md`
**Handoff**: `references/result-envelope.md` + `references/context-budget.md`

This skill runs in the **main conversation**. It owns every `AskUserQuestion` call **of its own**.
Delegated kits own theirs. After a callee returns, Read its `kit-result.json`.

`disable-model-invocation: true` — only a human types `/orchestrate-app`. Callees stay invokable.

---

## Resolve KIT_DIR (do this first)

`KIT_DIR` is the **plugin root** (the directory that contains `skills/`). Resolve in this order;
use the first that exists:

1. Parent of this skill folder — `{this SKILL.md directory}/../..` (Claude: if
   `${CLAUDE_SKILL_DIR}` is set, `KIT_DIR` is `${CLAUDE_SKILL_DIR}/../..`).
2. `app-dev-kit/app-orchestrator-kit` relative to the workspace root.
3. `.spec/app-orchestrator-kit`.

All script and reference paths are `{KIT_DIR}/skills/orchestrate-app/…`.

---

## Companion files (loaded on demand)

| Path | When |
|------|------|
| `references/pipeline-flow.md` | before starting |
| `references/context-budget.md` | before Station 1 |
| `references/result-envelope.md` | after every delegated Skill returns |
| `references/track-decomposition.md` | Station 2a |
| `references/work-plan-format.md` | reading/writing `work-plan.md` |
| `scripts/analyze-capabilities.mjs` | Station 2a |
| `scripts/write-kit-result.mjs` | Station 6 or abort |

This kit has **no agents of its own**.

---

## Prerequisites

| Requirement | Check | If missing |
|-------------|-------|-----------|
| Delegated plugins installed | Skill names resolve | STOP — install the plugin |
| `.spec/context/*.md` (new run, no approved spec) | `Glob(".spec/context/*.md")` | STOP |
| Clean git tree before each increment spawn | `git status --porcelain` | Ask: commit, stash, or abort |

Do not pre-install callee dependencies. Track order is backend → agent → frontend.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[app-name or existing spec/work-plan slug]` | Optional | Matches `.spec/app/spec-*_{slug}/` to resume. |

```
/orchestrate-app
/orchestrate-app demo-app
/orchestrate-app "a review tool for profiles"
```

---

## Steps

Read `references/pipeline-flow.md` and `references/context-budget.md` before starting.

### Station 0 — Resume

`Glob(".spec/app/spec-*/work-plan.md")`. If the argument matches:

- Read YAML only (track/task id/status/paths).
- `SPEC_PATH` = `spec-ref`. If missing or spec `status` is not `approved`, STOP.
- If `spec.md` is newer than `updated`, or analysis would change tracks: `AskUserQuestion` —
  **Re-derive work-plan** · **Resume as-is** · **Abort**.
- Else jump to the first track whose `status` is not `done` or `skipped` (and, for backend/agent,
  the first unfinished `B-*` / `A-*` task).
- Report: `"Resuming {slug} — tracks {done}/{needed}."`

Otherwise continue to Station 1.

### Station 1 — Spec

`Glob(".spec/app/spec-*/spec.md")`. Read YAML `status` only. If one is `approved`, set
`SPEC_PATH` and skip to Station 2.

If none:

1. Empty `.spec/context/` → STOP without invoking generate-spec.
2. Invoke `spec-dev-kit:generate-spec` with the slug/app name only.
3. Read newest `{RUN_DIR}/kit-result.json`. `approved` → `SPEC_PATH` = `spec_path`. Else STOP.

Do not Read `spec.md` body.

### Station 2 — Prototype (optional)

`AskUserQuestion` — generate a clickable HTML prototype? **Yes** / **Skip**.

On **Yes**: invoke `html-generator-kit:generate-html` with `SPEC_PATH: {SPEC_PATH}`.
Read `{dirname(SPEC_PATH)}/html-kit-result.json`. `approved` → `PROTOTYPE_REF` = `prototype_ref`.
Else `PROTOTYPE_REF = ""`.

On **Skip**: `PROTOTYPE_REF = ""`. Never Read prototype HTML.

### Station 2a — Analyze (this skill owns this gate)

```bash
node {KIT_DIR}/skills/orchestrate-app/scripts/analyze-capabilities.mjs {SPEC_PATH} --prototype-ref "{PROTOTYPE_REF}"
```

Exit 1 — no needed tracks — report and stop. Exit 2 — parse failure — stop.

Read `work-plan.md` YAML `tracks[]` (id, needed, confidence, task counts). Present one
`AskUserQuestion`: **Approve as-is** · **Skip a track** (human names it → `status: skipped`) ·
**Abort**. A `confidence: low` agent track **must** be confirmed, not silently kept.

### Station 3 — Backend loop

Skip if track `backend` is not `needed` or is `skipped`/`done`.

For each `tasks[]` with `track: backend` that is not `done`/`skipped`:

1. Dirty tree → commit / stash / abort-task. Never spawn dirty.
2. Set task `in-progress`. Set track `in-progress`.
3. Invoke `backend-dev-kit:backend-dev`:

   ```
   REQUEST:        Backend-task {id} ({slug-hint}). Read UPSTREAM_SPEC / WORK_PLAN.
   UPSTREAM_SPEC:  {SPEC_PATH}
   TASK_ID:        {id}
   ENTITY_REFS:    {entity-refs}
   API_REFS:       {api-refs}
   STORY_REFS:     {story-refs}
   AC_REFS:        {ac-refs}
   PROTOTYPE_REF:  {PROTOTYPE_REF}
   WORK_PLAN:      {work-plan.md}
   SLUG_HINT:      {slug-hint}
   RESULT_OUT:     {dirname(WORK_PLAN)}/results/{id}.json
   ```

4. Read `RESULT_OUT` (fallback `.spec/backend/{slug}.kit-result.json`). Apply the outcome table
   in `result-envelope.md`.
5. If tasks remain: continue / pause / abort. Never auto-run the next increment.

When all `B-*` tasks are `done` or `skipped`, set track `done` and `result` to the last envelope
(or `{dirname}/results/` if mixed).

### Station 4 — Agent loop

Same as Station 3 for `track: agent` → `agent-dev-kit:agent-dev`.

Also pass `AGENT_REF: {agent-ref}`.

If a task’s `embed` (from the spec, which the callee reads) is `backend-route` and
`src/http/create-app.ts` is missing, the callee STOPs. Do not invent a second HTTP stack;
offer to run the backend track first or skip embed.

### Station 5 — Frontend

Skip if track `frontend` is not `needed` or is `skipped`/`done`.

Dirty tree → commit / stash / abort-track.

Invoke `frontend-orchestrator-kit:orchestrate-frontend`:

```
SPEC_PATH:      {SPEC_PATH}
PROTOTYPE_REF:  {PROTOTYPE_REF}
SKIP_UPSTREAM:  true
WORK_PLAN:      {work-plan.md}
RESULT_OUT:     {dirname(WORK_PLAN)}/results/frontend.json
```

Read `{dirname(SPEC_PATH)}/frontend-kit-result.json` (or `RESULT_OUT`). Apply the outcome table
to the **frontend track** (not individual `T-*` rows — that kit owns `task-checklist.md`).

### Station 6 — Report

```bash
node {KIT_DIR}/skills/orchestrate-app/scripts/write-kit-result.mjs \
  --out {dirname(SPEC_PATH)}/app-kit-result.json \
  --kit orchestrate-app \
  --outcome approved \
  --spec-path {SPEC_PATH} \
  --prototype-ref "{PROTOTYPE_REF}" \
  --work-plan {WORK_PLAN} \
  --slug {slug} \
  --run-dir {dirname(SPEC_PATH)}
```

Report paths and counts only:

```
✅ App pipeline run for {slug}
Spec:       {SPEC_PATH}
Prototype:  {PROTOTYPE_REF or "skipped"}
Work plan:  {WORK_PLAN}
Tracks:     backend {status}, agent {status}, frontend {status}
Envelope:   {dirname(SPEC_PATH)}/app-kit-result.json
```

Remind `/create-pr` stays human-typed.

---

## Non-negotiables

1. Never bypass a delegated kit’s gate.
2. Progress lives in `work-plan.md` + `kit-result.json`.
3. Paths, not blobs.
4. One increment at a time (backend/agent). One frontend-orchestrator invocation.
5. Automation never ships.
