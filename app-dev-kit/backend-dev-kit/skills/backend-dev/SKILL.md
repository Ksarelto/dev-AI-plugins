---
name: backend-dev
description: Builds one Express API resource increment from a spec-dev-kit spec (and optional html-generator-kit prototype) — scoped UPSTREAM_SPEC import of entities and api-surface, hub-and-spoke (scaffold-service if needed, Zod, Drizzle, repository, service, router, OpenAPI, Vitest), quality gates, and a mandatory human review. Writes kit-result.json. Never opens a PR. Use when implementing a backend resource from an approved spec, not for a greenfield tree alone (that is scaffold-service) and not for adding a resource without a spec (that is express-feature).
argument-hint: "[resource-slug or request]"
disable-model-invocation: false
allowed-tools: [Read, Glob, Grep, Write, Edit, Bash, Agent, AskUserQuestion, Skill]
---

# Backend Dev

**Command**: `/backend-dev [resource-slug or request]`
**Pipeline driver**: `backend-orchestrator`
**Blackboard**: `.spec/backend/<slug>.md`

This skill runs in the **main conversation**. It owns every `AskUserQuestion` call. The
orchestrator is a subagent and must never ask the user.

---

## Resolve KIT_DIR

1. `{this SKILL.md directory}/../..` (or `${CLAUDE_SKILL_DIR}/../..`).
2. `app-dev-kit/backend-dev-kit` relative to the workspace root.
3. `.spec/backend-dev-kit`.

Scripts live at `{KIT_DIR}/skills/backend-dev/…`.

---

## Companion files

| Path | When |
|------|------|
| `references/pipeline-flow.md` | before starting |
| `references/upstream-contract.md` | Station 0 |
| `references/backend-spec-format.md` | blackboard schema |
| `references/packets.md` | packet types |
| `references/context-budget.md` | hub + workers |
| `references/quality-gates.md` | Station 5 |
| `references/human-review-protocol.md` | Station 12 |
| `scripts/import-upstream.mjs` | Station 0 |
| `scripts/new-backend.sh` | Station 0 |
| `scripts/validate-backend-spec.mjs` | Station 0.5 |
| `scripts/run-gates.sh` | Station 5 |
| `scripts/write-kit-result.mjs` | Station 12 / abort |

---

## Prerequisites

| Check | If missing |
|-------|-----------|
| Git repo | STOP |
| `create-app.ts` **or** ability to invoke `scaffold-service` | STOP if human declines scaffold |
| Clean working tree | Ask commit / stash |

---

## Arguments

Structured fields from `orchestrate-app` or the human: `UPSTREAM_SPEC`, `TASK_ID`, `SLICE_REF`,
`ENTITY_REFS`, `API_REFS`, `STORY_REFS`, `AC_REFS`, `PROTOTYPE_REF`,
`SLUG_HINT`, `RESULT_OUT`. `REQUEST` is one line when those are set.

```
/backend-dev
/backend-dev profile
/backend-dev "profiles CRUD with requireAuth"
```

---

## Steps

Read `references/pipeline-flow.md`.

### Station 0 — Intake

1. Resume if `.spec/backend/{slug}.md` matches the argument. If its `status` is `done`, report complete and stop unless the matching work-plan task is `pending` with `blocked-reason: spec changed`. Import then sets `status: approved`; skip Station 0.5 and continue at station 1.
2. Else derive slug from `SLUG_HINT` (never the app `metadata.slug`).
   If `UPSTREAM_SPEC` is empty, read `.spec/app/current.json` and set `UPSTREAM_SPEC` from
   `spec_path` and `PROTOTYPE_REF` from `prototype_ref`. Do not glob for a spec.
3. `bash {KIT_DIR}/skills/backend-dev/scripts/new-backend.sh {slug}`
4. If `UPSTREAM_SPEC` is set:

   ```bash
   node {KIT_DIR}/skills/backend-dev/scripts/import-upstream.mjs \
     --spec {UPSTREAM_SPEC} --out .spec/backend/{slug}.md \
     --task-id {TASK_ID} --slice-ref {SLICE_REF or omit} \
     --entity-refs {ENTITY_REFS} --api-refs {API_REFS} \
     --story-refs {STORY_REFS} --ac-refs {AC_REFS} \
     --prototype-ref "{PROTOTYPE_REF}" --require-scoped \
     --changes {dirname(UPSTREAM_SPEC)}/artifacts/changes.json
   ```

With `SLICE_REF` (spec 2.0) the import reads `{dirname(UPSTREAM_SPEC)}/slices/{SLICE_REF}.yaml` and
fills `## Business Rules`, `## State Machines`, `## Permissions`, `## Notifications`,
`## Non-functional`, and `## Slice Steps` from it. Those sections are the contract the build
enforces: every rule and permission becomes a service check with its error code, every state
machine transition a guarded service method, every system transition with `after` a scheduled job.
Pass `--changes` only when that file exists. A reopened board has `## Change request`. When `CHANGE=remove`, delete the existing tables and routes for those refs. Do not scaffold a replacement.

5. Spawn `backend-interpreter`, then `backend-analyst`, each with `run_in_background: true` and the Liveness parent loop below (`--check --worker {role}`). Pass paths only, plus `PULSE` and `PULSE_SCRIPT`. Each worker touches `--worker {its role}` on start and after each file it writes.
6. `CLARIFY_PACKET` → this skill asks; write `## Clarifications`; max 3 rounds. Exit 2 on that worker is the packet in `{dirname(PULSE)}/packet.json`.

### Station 0.5 — Human contract gate

`validate-backend-spec.mjs`. Present id/title/ACs. Approve / edit / abort.
Only this skill may set blackboard `status: approved`, except `import-upstream.mjs` on a spec-changed reopen.

### Stations 1–7 — Hub

Spawn `backend-orchestrator`:

```
MODE:         build
SLUG:         {slug}
SPEC_PATH:    .spec/backend/{slug}.md
KIT_DIR:      {resolved plugin root}
UPSTREAM_SPEC: {path only}
PULSE:        .spec/backend/{slug}.context/pulse.json
PULSE_SCRIPT: {PULSE_SCRIPT argument, or the resolved check-pulse.mjs}
```

Spawn that orchestrator with `run_in_background: true`, then run the parent loop. Do not block on the Agent call.

If `src/http/create-app.ts` is missing, the hub invokes `scaffold-service` (now invokable)
then continues. Implementer is `api-implementer`. Tests: `test-writer`. Review: `code-reviewer`.
Gates: `quality-gate-runner` via `run-gates.sh`.

`DEP_PACKET` → this skill asks per package. `MODE: revise` uses the same loop and the same `PULSE` / `PULSE_SCRIPT`.

### Liveness — poll the agent

Canonical procedure: `{PULSE_SCRIPT directory}/../references/agent-liveness.md` when that file exists. It wins if this section disagrees. Resolve `PULSE_SCRIPT` in order: the argument, `app-dev-kit/frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/check-pulse.mjs` from the workspace root, then `{KIT_DIR}/../frontend-orchestrator-kit/skills/orchestrate-frontend/scripts/check-pulse.mjs`.

`PULSE` is `.spec/backend/{slug}.context/pulse.json`. If the real slug differs from a passed `SLUG_HINT` path, use the real path. When `WATCH` was passed, write the pointer before the first spawn:

```bash
node {PULSE_SCRIPT} --watch {WATCH} --station 3 --pulse {PULSE}
```

1. Record `agent_id`. Touch `--role backend-orchestrator --status working --station start`. Station 0 workers: `--role backend-dev --station 0`, then `--check --worker {role}`.
2. Every 60 seconds, `sleep 60` once, then `node {PULSE_SCRIPT} --check --pulse {PULSE}`. A Station 0 worker adds `--worker {role}`. Do not end the turn while `status` is `working`.
3. Exit 0: keep waiting. Exit 2: Read `{dirname(PULSE)}/packet.json` and handle it in the packet table in `references/packets.md`. Exit 3, 4, or 5: `resume` the same id once ("Update the pulse and continue from the checkpoint"). If that does not move `updated_at` within 60 seconds, abandon it (`interrupt: true` only when it is still running) and fresh-spawn from the checkpoint path. At most two fresh spawns. Then write the envelope `--outcome error --reason stale-agent` and stop.
4. `awaiting-human` is healthy. Never resume or rebuild across it.

If the script is missing, Read the pulse JSON and apply the same rules: `working` and `updated_at` older than 3 minutes → not responding; `station` and `artifact` unchanged for 15 minutes → stalled; `awaiting-human` → healthy; no file → missing.

### Station 12 — Human review

Present `REVIEW_PACKET`. Approve → `status: done` + envelope. Changes → re-spawn
`MODE: revise`. Abort → envelope `aborted`. Never `/create-pr`.

```bash
node {KIT_DIR}/skills/backend-dev/scripts/write-kit-result.mjs \
  --out .spec/backend/{slug}.kit-result.json \
  --kit backend-dev --outcome approved \
  --spec-path {UPSTREAM_SPEC} --backend-spec .spec/backend/{slug}.md \
  --prototype-ref "{PROTOTYPE_REF}" --slug {slug} --branch {branch} \
  --run-dir .spec/backend
```

If `RESULT_OUT` is set, `--also {RESULT_OUT}`.
