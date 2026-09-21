# Context budget — frontend-orchestrator-kit

Binding contract for `/orchestrate-frontend`. Cross-kit handoff is **paths on disk**, not blobs in
the parent conversation. Inner kits already isolate their workers; this file stops the **glue
layer** from re-accumulating those workers’ context.

Companion schema: `result-envelope.md` (canonical copy lives in
`app-orchestrator-kit/skills/orchestrate-app/references/result-envelope.md`).

---

## Non-negotiables

1. **Never inline** an app `spec.md`, prototype HTML/CSS/JS, `page-map.json` body, feature
   blackboard, `REVIEW_PACKET` markdown, `qa-log.md`, or `intake.json` into this skill’s
   prompts or into a Skill-tool spawn.
2. After a delegated skill returns, the parent reads **only** that kit’s `kit-result.json`
   (see `result-envelope.md`). Progress otherwise lives in `task-checklist.md`.
3. Skill-tool arguments are structured **paths and ids**: `SPEC_PATH`, `TASK_ID`,
   `SCREEN_REF`, `STORY_REFS`, `AC_REFS`, `ENTITY_REFS`, `PROTOTYPE_REF`, `CHECKLIST_PATH`,
   `SLUG_HINT`, `RESULT_OUT`. Not file contents.
4. `REQUEST` to feature-dev is at most **one line** naming the task id and the files to read.
   `import-upstream.mjs` already writes stories/ACs onto the blackboard from `UPSTREAM_SPEC`.
5. `build-checklist.mjs` reads `spec.md` from disk. This skill does not parse YAML stories
   into chat in order to derive tasks.
6. Station 2a presents checklist **id / title / priority** from the YAML `tasks[]` — not the
   spec body.
7. Station 4 report is paths + checklist counts + branch names from the checklist file.

---

## What this skill may hold

| Item | Form |
|------|------|
| `KIT_DIR` | path |
| `SPEC_PATH` | path to `spec.md` |
| `PROTOTYPE_REF` | path to prototype dir, or `""` |
| `CHECKLIST_PATH` | path to `task-checklist.md` |
| Current `task.id` and its id-lists | `T-001`, `SCR-001`, `US-…`, `AC-…` |
| Envelope `outcome` / `slug` / `branch` / `reason` | from `kit-result.json` |

## What this skill must not hold

| Item | Where it lives instead |
|------|------------------------|
| Spec YAML / markdown body | `SPEC_PATH` |
| Prototype pages | `PROTOTYPE_REF` |
| Feature blackboard | `.spec/features/{slug}.md` (envelope `feature_spec`) |
| Callee skill transcripts | discarded; envelope + artifacts |
| Synthesized multi-paragraph REQUEST | `import-upstream.mjs` output on the blackboard |
| `work-plan.md` body | parent `app-orchestrator-kit` |

---

## Size guards

If you are about to paste more than ~20 lines that originated in another kit, stop and pass the
path instead. There is no legitimate reason for this skill to exceed that.

---

## HITL vs isolation

This skill and the three callees all run in the **main conversation** so `AskUserQuestion`
reaches the user (sibling kits assert a subagent gate does not). Isolation is achieved by
**filesystem handoff**, not by `context: fork` on the callees. Do not add `context: fork` here
until a forked skill’s `AskUserQuestion` is verified live.
