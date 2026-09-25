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

Structured fields from `orchestrate-app` or the human: `UPSTREAM_SPEC`, `TASK_ID`,
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
     --task-id {TASK_ID} --entity-refs {ENTITY_REFS} --api-refs {API_REFS} \
     --story-refs {STORY_REFS} --ac-refs {AC_REFS} \
     --prototype-ref "{PROTOTYPE_REF}" --require-scoped \
     --changes {dirname(UPSTREAM_SPEC)}/artifacts/changes.json
   ```

Pass `--changes` only when that file exists. A reopened board has `## Change request`. When `CHANGE=remove`, delete the existing tables and routes for those refs. Do not scaffold a replacement.

5. Spawn `backend-interpreter` then `backend-analyst` (paths only).
6. `CLARIFY_PACKET` → this skill asks; write `## Clarifications`; max 3 rounds.

### Station 0.5 — Human contract gate

`validate-backend-spec.mjs`. Present id/title/ACs. Approve / edit / abort.
Only this skill may set blackboard `status: approved`, except `import-upstream.mjs` on a spec-changed reopen.

### Stations 1–7 — Hub

Spawn `backend-orchestrator` with `MODE: build`, `SLUG`, `SPEC_PATH` (blackboard),
`KIT_DIR`, `UPSTREAM_SPEC`. It returns one packet.

If `src/http/create-app.ts` is missing, the hub invokes `scaffold-service` (now invokable)
then continues. Implementer is `api-implementer`. Tests: `test-writer`. Review: `code-reviewer`.
Gates: `quality-gate-runner` via `run-gates.sh`.

`DEP_PACKET` → this skill asks per package.

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
