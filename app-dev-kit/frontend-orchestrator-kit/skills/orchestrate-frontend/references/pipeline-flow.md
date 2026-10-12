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
| 0 | Resume check | this skill *(inline)* | Read `.spec/app/current.json`, then `.spec/app/task-checklist.md`; if spec is newer, offer Station 2a re-derive before Station 3 |
| 1 | Spec | `spec-dev-kit:generate-spec` | Spec chat only. Skip when `SKIP_UPSTREAM` (feature chat) or an `approved` spec already matches and `.spec/context/` is empty (stop; the next chat is the prototype). Pass `RESULT_OUT: .spec/app/results/generate-spec.json` and `BUILDS: frontend`. On `approved`, write `reason: resume-in-new-chat` and stop. Requires `.spec/context/*.md` when no spec is approved |
| 2 | Prototype | `html-generator-kit:generate-html` | Prototype chat only. Skip when `SKIP_UPSTREAM` or the prototype is already settled. Pass `SPEC_PATH` and `CONFIRMED: true` (skips only the Proceed question; the review gate stays). On skip or continue-without, write `html-kit-result.json` with `reason: skipped`. Then stop. Do not derive the checklist here |
| 2a | Checklist derivation | `scripts/build-checklist.mjs` + this skill | Feature chat, when the checklist is missing or unapproved. **UI screens only.** Script reads `spec.md` from disk. Human confirms the list. Then this chat runs one feature |
| 3 | One feature | `feature-dev-kit:feature-dev` (once) | Paths + ids. Clean git tree required. Envelope → `done` / `pending` / `blocked` / leave `in-progress`. Missing envelope re-runs once. If features remain, write `reason: resume-in-new-chat` and stop |
| 4 | Report | this skill *(inline)* | Only when no feature remains. Write `frontend-kit-result.json` with `outcome: approved`; paths + checklist counts; remind `/create-pr` |

---

## Ownership invariants

- **Each delegated kit keeps its own review gates.** This skill never answers those. `CONFIRMED: true`
  skips only a question the human already answered here (prototype Proceed). It does not pre-approve a review.
- **This skill owns**: Station 0 spec-newer prompt, Station 2 prototype yes/skip, Station 2a
  checklist confirm, Station 3 dirty-tree. It does not own a continue-here choice. Spec, prototype,
  and each feature are separate chats.
- **Blackboard**: `task-checklist.md` is the only cross-run **progress** file. Callee outcomes
  are `kit-result.json` files. A skipped prototype is `html-kit-result.json` with `reason: skipped`.
  Chat is not a store.
- **A task is `done` only when** feature-dev’s envelope `outcome` is `approved` (its Station 12).
  Never mark `done` from a partial transcript.
- **Do not edit `.spec/app/work-plan.md`.** That file is owned by `app-orchestrator-kit`.

---

## Outcomes (canonical)

| Envelope `outcome` | Checklist `status` |
|--------------------|--------------------|
| `approved` | `done` (record `slug` / `branch`) |
| `aborted` (human declined) | `pending` |
| `error` (structural: rejected dep, missing scoped import, …) | `blocked` + `blocked-reason` |
| missing envelope after return | leave `in-progress` and re-run that station once from its checkpoint |
| missing envelope after that re-run | `blocked` + `blocked-reason: agent-failed`; ask once; do not start the next feature |

Do **not** use a second mapping. `SKILL.md` and this file must match. Only an envelope is `approved`.

---

## Station 3 — Feature Loop

```
feature = first feature in file order whose status is not done or skipped
if none: Station 4
if feature.status == blocked: ask human whether to retry or keep skipping; else stop
if git working tree dirty: ask commit / stash / abort-feature; do not spawn dirty

  set feature.status = in-progress; persist checklist
  do not check out develop / main / master between features

  before the first feature of the run: preflight-host.mjs once (ask once on issues)
  print the field block: read-checklist.mjs CHECKLIST_PATH --payload feature.id --preflight passed|accepted
  spawn feature-dev-kit:feature-dev once for this feature (nested tasks are not extra calls) with it:
    REQUEST:        one line — feature id + "nested tasks in CHECKLIST_PATH; read UPSTREAM_SPEC"
    UPSTREAM_SPEC:  {spec.md path}
    FEATURE_ID:     feature.id
    SLICE_REF:      feature.slice-ref, or omit on a 1.x checklist
    TASK_IDS:       comma-separated nested task ids
    SCREEN_REFS:    comma-separated nested screen-refs
    STORY_REFS:     union of nested task story-refs
    AC_REFS:        union of nested task ac-refs
    ENTITY_REFS:    union of nested task entity-refs
    PROTOTYPE_REF:  checklist.prototype-ref      # may be empty
    CHECKLIST_PATH: {task-checklist.md path}
    SLUG_HINT:      feature.slug-hint
    PARENT_BRANCH:  row parent-branch, else HEAD when it is feature/* and not this row's branch, else the branch of the last done feature before this row; empty only when none of those exist
    RESULT_OUT:     {checklist dir}/results/{feature.id}.json
    PREFLIGHT:      passed | accepted   (always; accepted only after Continue anyway)
    (never inline spec body, stories, or ACs)
    (CHANGE=remove only when every nested task change is remove; omit otherwise)

  wait for it to return
  run update-checklist.mjs --result RESULT_OUT --fallback feature kit-result.json
  follow printed next:
    continue → if more features remain: write outcome aborted, reason resume-in-new-chat, and STOP
               if none remain: Station 4
    rerun    → re-invoke this feature once from its checkpoint
    ask      → ask once; do not start the next feature
    stop     → STOP (envelope aborted); do not start the next feature
```

**No second feature starts in this chat. `next: continue` with features remaining is a stop. The next feature starts when the human opens a new chat and runs `/orchestrate-frontend {slug}`.**

Git: `new-feature.sh` refuses a dirty tree and prints `PARENT` as the branch it was cut from.
`git checkout -b` for the next feature is from **current HEAD** (the previous `feature/*` branch).
A fresh chat started elsewhere still stacks: `PARENT_BRANCH` falls back to the last `done` feature's `branch`.
`/create-pr` rebases onto and targets that `parent-branch` (`develop` when empty). Do not retarget a stack to `develop`.

---

## Error Handling

| Error | Action |
|-------|--------|
| Empty `.spec/context/` and no approved spec | STOP before invoking generate-spec |
| Envelope `aborted` / `error` from Station 1 | STOP — nothing downstream can run |
| `html-generator-kit` declined or envelope aborted | Ask once: continue without (`html-kit-result.json` `reason: skipped`) or stop. Do not start the checklist in this chat |
| Empty prototype decision on the next chat | A missing `html-kit-result.json` and an empty `prototype_ref` means the prototype was not settled — that chat is the prototype chat |
| `build-checklist.mjs` produces zero features | Surface `SPEC_PATH` and stop |
| Dirty tree at Station 3 | Do not spawn; commit/stash/block |
| feature-dev envelope missing | Leave `in-progress`; never mark `done`. Re-run once from its checkpoint, then `blocked` / `agent-failed` |
| Checklist file corrupted / unparsable | STOP — human fixes or deletes it |
