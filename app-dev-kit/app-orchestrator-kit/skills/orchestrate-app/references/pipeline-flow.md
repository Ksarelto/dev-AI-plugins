# Pipeline Flow — App Orchestrator Kit (CANONICAL)

**Invoked by**: the `orchestrate-app` skill (`SKILL.md`)

> This file sequences spec → prototype → capability analysis → backend → agent → frontend.
> It does **not** re-define station order inside delegated kits. Each callee owns its own
> gates. Cross-kit data: **paths + `kit-result.json`**.

---

## Station Map

| # | Station | Delegate to | Notes |
|---|---------|-------------|-------|
| 0 | Resume | this skill | Glob `work-plan.md`; jump to first unfinished track |
| 1 | Spec | `spec-dev-kit:generate-spec` | Only if no `status: approved` spec |
| 2 | Prototype | `html-generator-kit:generate-html` | Optional. Pass `SPEC_PATH` |
| 2a | Analyze | `scripts/analyze-capabilities.mjs` | Writes `work-plan.md`. Human confirms tracks |
| 3 | Backend loop | `backend-dev-kit:backend-dev` | One `B-*` task at a time. Skip if track not needed / skipped |
| 4 | Agent loop | `agent-dev-kit:agent-dev` | One `A-*` task at a time. Skip if track not needed / skipped |
| 5 | Frontend | `frontend-orchestrator-kit:orchestrate-frontend` | Owns the `T-*` loop. Pass `SKIP_UPSTREAM` |
| 6 | Report | this skill | Write `app-kit-result.json`; paths + counts |

Track order is **backend → agent → frontend**. Do not fan out tracks that share a host tree
(`embed-agent` into `compose.ts`).

---

## Ownership

- Delegated kits keep their own `AskUserQuestion` gates. Never pre-approve.
- This skill owns: resume, prototype yes/skip, track confirm, dirty-tree, continue/pause/abort.
- Blackboard: `work-plan.md`. Callee outcomes: `kit-result.json`. Chat is not a store.
- A track or task is `done` only when the callee envelope `outcome` is `approved`.

---

## Error handling

| Error | Action |
|-------|--------|
| Empty `.spec/context/` and no approved spec | STOP before generate-spec |
| Spec envelope aborted / error | STOP |
| html-generator aborted | `PROTOTYPE_REF = ""`; continue to 2a |
| `analyze-capabilities.mjs` exit 1 | No needed tracks — report and stop |
| Dirty tree before a spawn | Do not spawn; commit / stash / block |
| Callee envelope missing | Leave `in-progress`; never mark `done` |
