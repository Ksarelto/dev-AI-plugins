# Pipeline Flow — Frontend Orchestrator Kit (CANONICAL)

**Invoked by**: the `orchestrate-frontend` skill (`SKILL.md`), or `app-orchestrator-kit:orchestrate-app`

> This file is the single source of truth for station order in this kit. It does **not** re-define
> station order *inside* spec-dev-kit, html-generator-kit, or feature-dev-kit — each of those owns
> its own `references/pipeline-flow.md` and its own human gates. This file only sequences the three
> kits and the UI checklist loop around them.
>
> Cross-kit data: **paths + `kit-result.json`**. See `context-budget.md` and `result-envelope.md`.
> If another file in this kit disagrees, this file plus those two win.

---

## Station Map

| # | Station | Delegate to | Notes |
|---|---------|-------------|-------|
| 0 | Resume check | this skill *(inline)* | Glob `task-checklist.md`; if spec is newer, offer Station 2a re-derive before Station 3 |
| 1 | Spec | `spec-dev-kit:generate-spec` | Skip when `SKIP_UPSTREAM` or an `approved` spec already matches. Requires `.spec/context/*.md` |
| 2 | Prototype | `html-generator-kit:generate-html` | Optional. Skip when `SKIP_UPSTREAM`. Pass `SPEC_PATH`. Capture `{dirname(SPEC_PATH)}/html-kit-result.json` |
| 2a | Checklist derivation | `scripts/build-checklist.mjs` + this skill | **UI screens only.** Script reads `spec.md` from disk. Human confirms the list |
| 3 | Task loop | `feature-dev-kit:feature-dev` (once per task) | Paths + ids only. Clean git tree required. Envelope → `done` / `pending` / `blocked` / leave `in-progress` |
| 4 | Report | this skill *(inline)* | Write `frontend-kit-result.json`; paths + checklist counts; remind `/create-pr` |

---

## Ownership invariants

- **Each delegated kit keeps its own `AskUserQuestion` gates.** This skill never answers on their
  behalf and never bypasses them by pre-approving.
- **This skill owns**: Station 0 spec-newer prompt, Station 2 prototype yes/skip, Station 2a
  checklist confirm, Station 3 dirty-tree and continue/pause/abort.
- **Blackboard**: `task-checklist.md` is the only cross-run **progress** file. Callee outcomes
  are `kit-result.json` files. Chat is not a store.
- **A task is `done` only when** feature-dev’s envelope `outcome` is `approved` (its Station 12).
  Never mark `done` from a partial transcript.
- **Do not edit `WORK_PLAN`.** That file is owned by `app-orchestrator-kit`.

---

## Outcomes (canonical)

| Envelope `outcome` | Checklist `status` |
|--------------------|--------------------|
| `approved` | `done` (record `slug` / `branch`) |
| `aborted` (human declined) | `pending` |
| `error` (structural: rejected dep, missing scoped import, …) | `blocked` + `blocked-reason` |
| missing envelope (crash mid-station) | leave `in-progress`; resume re-offers it |

Do **not** use a second mapping. `SKILL.md` and this file must match.

---

## Station 3 — Task Loop

```
tasks = read(task-checklist.md).tasks
for task in tasks (in file order):
  if task.status in [done, skipped]: continue
  if task.status == blocked: ask human whether to retry or keep skipping; else continue
  if git working tree dirty: ask commit / stash / abort-task; do not spawn dirty

  set task.status = in-progress; persist checklist

  spawn feature-dev-kit:feature-dev with:
    REQUEST:        one line — task id + "read UPSTREAM_SPEC"
    UPSTREAM_SPEC:  {spec.md path}
    TASK_ID, SCREEN_REF, STORY_REFS, AC_REFS, ENTITY_REFS
    PROTOTYPE_REF:  checklist.prototype-ref      # may be empty
    CHECKLIST_PATH: {task-checklist.md path}
    SLUG_HINT:      task.slug-hint
    RESULT_OUT:     {checklist dir}/results/{task.id}.json
    (never inline spec body, stories, or ACs)

  envelope = Read(RESULT_OUT)   # fallback feature kit-result.json
  apply Outcomes table above
  persist checklist

  if more tasks remain:
    AskUserQuestion — continue (may stack on current feature/* HEAD) / pause / abort
```

**Never auto-run more than one `feature-dev-kit` sub-run without asking.**

Git: `new-feature.sh` refuses a dirty tree. `git checkout -b` for the next task is from **current
HEAD**, not from the printed `BASE`. Independent PRs require pause + `/create-pr` (or merge)
before Continue.

---

## Error Handling

| Error | Action |
|-------|--------|
| Empty `.spec/context/` and no approved spec | STOP before invoking generate-spec |
| Envelope `aborted` / `error` from Station 1 | STOP — nothing downstream can run |
| `html-generator-kit` declined or envelope aborted | `PROTOTYPE_REF = ""`; continue to Station 2a |
| `build-checklist.mjs` produces zero tasks | Surface `SPEC_PATH` and stop |
| Dirty tree at Station 3 | Do not spawn; commit/stash/block |
| feature-dev envelope missing | Leave `in-progress`; never mark `done` |
| Checklist file corrupted / unparsable | STOP — human fixes or deletes it |
