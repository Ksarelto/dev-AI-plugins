---
name: orchestrate-app
description: Runs the full app-dev-kit pipeline end-to-end — spec-dev-kit to author a spec, html-generator-kit to prototype it, then feature-dev-kit to build every derived feature one by one — tracked against a persisted, resumable task checklist. Cross-kit handoff is file paths and kit-result.json envelopes, never inlined spec or prototype bodies. Use when starting or resuming a whole app/domain build, not a single feature (for a single feature, use feature-dev-kit's /feature-dev directly).
argument-hint: "[app-name or existing spec/checklist slug]"
disable-model-invocation: true
allowed-tools: [Read, Glob, Grep, Write, Bash, Skill, AskUserQuestion]
---

# Orchestrate App

**Entry point for**: the app-dev-kit pipeline as a whole (spec → prototype → features)
**Delegates to**: `spec-dev-kit:generate-spec`, `html-generator-kit:generate-html`,
`feature-dev-kit:feature-dev` — each invoked as its own plugin skill, each keeping its own gates
**State file**: `.spec/app/spec-{tc}_{slug}/task-checklist.md`
**Handoff**: `references/result-envelope.md` + `references/context-budget.md`

This skill runs in the **main conversation**. It owns every `AskUserQuestion` call **of its own**.
Delegated kits own theirs. After a callee returns, Read its `kit-result.json` — do not keep its
transcript, spec body, or prototype files in this context.

`disable-model-invocation: true` — only a human types `/orchestrate-app`. This skill may then
invoke the three callees (those skills stay auto-invokable on purpose).

---

## Resolve KIT_DIR (do this first)

`KIT_DIR` is the **plugin root** (the directory that contains `skills/`). Resolve in this order;
use the first that exists:

1. Parent of this skill folder — `{this SKILL.md directory}/../..` (Claude: if
   `${CLAUDE_SKILL_DIR}` is set, `KIT_DIR` is `${CLAUDE_SKILL_DIR}/../..`).
2. `app-dev-kit/orchestrator-kit` relative to the workspace root (this marketplace repo).
3. `.spec/orchestrator-kit` (legacy consumer copy).

All script and reference paths are `{KIT_DIR}/skills/orchestrate-app/…`. Never hardcode
`.spec/orchestrator-kit/skills/…`.

---

## Companion files (loaded on demand — not loaded unless a step references them)

| Path | Loaded by | When |
|------|-----------|------|
| `references/pipeline-flow.md` | this skill | before starting — canonical station order, ownership, error handling |
| `references/context-budget.md` | this skill | before Station 1 — what may live in the parent context |
| `references/result-envelope.md` | this skill | after every delegated Skill returns |
| `references/task-decomposition.md` | this skill, `build-checklist.mjs` | Station 2a |
| `references/checklist-format.md` | this skill | reading/writing `task-checklist.md` |
| `templates/checklist.md` | `build-checklist.mjs` (first generation only) | scaffold shape |
| `scripts/build-checklist.mjs` | this skill (Bash) | deterministic task derivation / re-derivation |

This kit has **no agents of its own**.

---

## Prerequisites

| Requirement | Check | If missing |
|-------------|-------|-----------|
| `spec-dev-kit`, `html-generator-kit`, `feature-dev-kit` installed | Skill names resolve | STOP — install the plugin |
| `.spec/context/*.md` (new run with no approved spec) | `Glob(".spec/context/*.md")` | STOP — drop requirement `.md` files, then retry |
| FSD host (before Station 3) | `src/app`, `src/pages`, `src/features`, `src/entities`, `src/shared` | STOP — feature-dev-kit does not clone a starter |
| `frontend-dev-kit` (before Station 3) | `architecture-audit` skill resolvable | STOP — required companion |
| Clean git tree (before each Station 3 spawn) | `git status --porcelain` | AskUserQuestion: commit, stash, or abort — do not invoke feature-dev |

Do not pre-install a delegated kit’s own dependencies (`ui-ux-pro-max`, shadcn MCP) — each kit
resolves those at run time.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[app-name or existing spec/checklist slug]` | Optional | Matches an existing `.spec/app/spec-*_{slug}/` run to resume. Free text starts a new app. Omitted → this skill asks for the app name/description. |

```
/orchestrate-app
/orchestrate-app demo-app
/orchestrate-app "a review tool for profiles"
```

---

## Steps

Read `references/pipeline-flow.md` and `references/context-budget.md` before starting.

### Station 0 — Resume check

1. `Glob(".spec/app/spec-*/task-checklist.md")`. If the argument matches an existing run (slug
   substring in the folder name):
   - Read the checklist YAML **only** (id/title/status/paths — not a dump of the spec).
   - `SPEC_PATH` = `spec-ref`. If that file is missing, STOP.
   - Read `status:` from the spec **front matter only**. If it is not `approved`, STOP — finish
     `/generate-spec` first.
   - If `spec.md` is newer than checklist `updated`, or `build-checklist.mjs` would add/block
     tasks: `AskUserQuestion` — **Re-derive checklist** (run Station 2a, keep existing
     `done`/`skipped` ids) · **Resume as-is** · **Abort**.
   - Otherwise jump to **Station 3** at the first task whose `status` is not `done` or `skipped`.
     Treat leftover `in-progress` as the first item to re-offer (do not mark it `done`).
     Report: `"Resuming {slug} — {done}/{total} tasks done."`
2. Otherwise this is a new run — continue to Station 1.

### Station 1 — Spec

`Glob(".spec/app/spec-*/spec.md")` filtered by the argument. For each candidate, read **only**
the YAML `status` field. If one is `approved`, set `SPEC_PATH` to that file and skip to Station 2.

If none approved:

1. `Glob(".spec/context/*.md")`. If empty → STOP:
   `"No requirement files found in .spec/context/. Drop .md files there, then re-run /orchestrate-app."`
   Do **not** invoke generate-spec (it would stop the same way after loading its skill body).
2. Invoke `spec-dev-kit:generate-spec` with the **slug/app name only** — never paste context-file
   contents. It owns its HITL gate.
3. After it returns, `Glob(".spec/app/spec-*/kit-result.json")`, take the newest, Read it.
   - `outcome: approved` → `SPEC_PATH` = envelope `spec_path`.
   - `aborted` / `error` / missing file → STOP. Nothing downstream can run.

Do not Read `spec.md` body here.

### Station 2 — Prototype (optional)

`AskUserQuestion` — "Generate a clickable HTML prototype before building features? (recommended for
apps with more than one screen)" — **Yes** / **Skip**.

On **Yes**: invoke `html-generator-kit:generate-html` with structured fields, **not** a pasted spec:

```
SPEC_PATH: {SPEC_PATH}
```

Argument: the spec **folder name** (`spec-{tc}_{slug}`) or the `spec.md` path — generate-html
treats an existing `spec.md` path as `SPEC_FILE` and will not re-glob “most recent”.

After return, Read `{dirname(SPEC_PATH)}/html-kit-result.json`:

- `outcome: approved` → `PROTOTYPE_REF` = envelope `prototype_ref` (the **new** prototype
  timecode folder — not the spec folder’s timecode).
- `aborted` / `error` / missing → `PROTOTYPE_REF = ""` and continue to Station 2a.

On **Skip**: `PROTOTYPE_REF = ""`.

Never Read prototype HTML into this conversation.

### Station 2a — Checklist derivation (THIS skill owns this gate)

```bash
node {KIT_DIR}/skills/orchestrate-app/scripts/build-checklist.mjs {SPEC_PATH} --prototype-ref "{PROTOTYPE_REF}"
```

The script Reads `spec.md` from disk. Do not pre-load the spec into chat.

Exit 1 — no buildable (non-`wont`) user-stories or screens — report `SPEC_PATH` and stop.
Exit 2 — parse/usage failure — report the error lines and stop.

On exit 0, Read `task-checklist.md` YAML `tasks[]` and present **id, title, priority** via one
`AskUserQuestion`: **Approve as-is** · **Edit** (relay free text; apply to YAML `tasks[]`;
re-present) · **Abort**.

### Station 3 — Task loop

For each task in checklist order, skipping `done` / `skipped`:

1. If `status: blocked`, ask once whether to retry (`pending`) or keep skipping.
2. If `status: in-progress` (crashed prior run): re-offer this task; do not assume it finished.
3. `git status --porcelain` — if dirty, `AskUserQuestion`: **Commit** (you wait; re-check) ·
   **Stash** · **Abort this task** (`blocked`, reason: dirty tree). Never spawn feature-dev dirty.
   `new-feature.sh` will exit 1 if you skip this.
4. Set `status: in-progress`, append a `## Log` line, write the checklist.
5. Invoke `feature-dev-kit:feature-dev` with **paths and ids only**:

   ```
   REQUEST:        Screen-task {task.id} ({task.slug-hint or task.screen-ref}). Read UPSTREAM_SPEC / CHECKLIST_PATH; do not expect an inlined spec.
   UPSTREAM_SPEC:  {SPEC_PATH}
   TASK_ID:        {task.id}
   SCREEN_REF:     {task.screen-ref}
   STORY_REFS:     {task.story-refs}
   AC_REFS:        {task.ac-refs}
   ENTITY_REFS:    {task.entity-refs}
   PROTOTYPE_REF:  {checklist prototype-ref}
   CHECKLIST_PATH: {path to task-checklist.md}
   SLUG_HINT:      {task.slug-hint}
   RESULT_OUT:     {dirname(CHECKLIST_PATH)}/results/{task.id}.json
   ```

   Do **not** paste user stories, ACs, or spec YAML into `REQUEST`. feature-dev’s
   `import-upstream.mjs` reads `UPSTREAM_SPEC`.
6. After return, Read `RESULT_OUT` (fallback: `.spec/features/{slug}.kit-result.json` from
   envelope glob if `RESULT_OUT` is missing).
   - `outcome: approved` → `status: done`; copy `slug` / `branch` from the envelope; log.
   - `outcome: aborted` → `status: pending`; log `reason`.
   - `outcome: error` → `status: blocked`; `blocked-reason` = envelope `reason`.
   - missing envelope after a crash → leave `in-progress`; log “no kit-result”; on resume, re-offer.
7. If tasks remain: `AskUserQuestion` —
   "Task {n}/{total} finished. Next feature-dev will stack on the current HEAD if you are still
   on `feature/*` (independent PRs need `/create-pr` or merge first). Continue, pause, or abort?"
   - **Continue** → next task.
   - **Pause** → STOP. Re-running `/orchestrate-app {slug}` resumes here.
   - **Abort** → STOP, checklist stays as-is.

**Never run a second `feature-dev` without this confirmation.**

### Station 4 — Report

Read the checklist file. Report **paths and counts only**:

```
✅ App pipeline run for {slug}
Spec:       {SPEC_PATH}
Prototype:  {PROTOTYPE_REF or "skipped"}
Checklist:  {done}/{total} done, {skipped} skipped, {blocked} blocked

Branches ready for review (run /create-pr yourself for each):
  - {task.branch}  ({task.title})
  ...

Remaining: {pending titles} — re-run /orchestrate-app {slug} to continue.
```

---

## Non-negotiables

1. **Never bypass a delegated kit’s gate.** Wait; do not pre-approve.
2. **Progress lives in `task-checklist.md` + `kit-result.json`, not in chat.**
3. **Paths, not blobs** — `references/context-budget.md`.
4. **One feature sub-run at a time**, with confirmation between each.
5. **Automation never ships.** `/create-pr` stays human-typed.

---

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| Callee skill not found | Install the plugin, retry |
| `build-checklist.mjs` exits 1 | Spec has no non-`wont` stories/screens — revise the spec |
| `kit-result.json` missing after a Skill return | Treat as `error`; do not guess paths from chat |
| Dirty tree blocks Station 3 | Commit or stash; `new-feature.sh` refuses a dirty worktree |
| Checklist `blocked` after a spec edit | Source screen/story removed — confirm at Station 2a |
| Want to restart one task | Set its row to `pending`, clear `slug`/`branch`, re-run |
