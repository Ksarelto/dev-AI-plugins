# Context budget — app-orchestrator-kit

Binding contract for `/orchestrate-app`. Cross-kit handoff is **paths on disk**, not blobs in
the parent conversation.

Companion schema: `result-envelope.md`.

---

## Non-negotiables

1. **Never inline** an app `spec.md`, prototype HTML/CSS/JS, `page-map.json` body, feature /
   backend / agent blackboards, `REVIEW_PACKET` markdown, `qa-log.md`, or `intake.json` into
   this skill’s prompts or into a Skill-tool spawn.
2. After a delegated skill returns, read **only** that kit’s `kit-result.json`.
   Progress otherwise lives in `work-plan.md`.
3. Skill-tool arguments are structured **paths and ids**: `SPEC_PATH`, `TASK_ID`,
   `ENTITY_REFS`, `API_REFS`, `AGENT_REF`, `STORY_REFS`, `AC_REFS`, `PROTOTYPE_REF`,
   `WORK_PLAN`, `SLUG_HINT`, `RESULT_OUT`, `SKIP_UPSTREAM`. Not file contents.
4. `analyze-capabilities.mjs` reads `spec.md` from disk. This skill does not parse YAML
   stories into chat in order to pick tracks.
5. Station 2a presents track **id / needed / confidence / task counts** — not the spec body.
6. Station 6 report is paths + track counts + branch names from the work-plan file.

---

## What this skill may hold

| Item | Form |
|------|------|
| `KIT_DIR` | path |
| `SPEC_PATH` | path to `spec.md` |
| `PROTOTYPE_REF` | path to prototype dir, or `""` |
| `WORK_PLAN` | path to `work-plan.md` |
| Current track id and task id | `backend`, `B-001` |
| Envelope `outcome` / `slug` / `branch` / `reason` | from `kit-result.json` |

## What this skill must not hold

| Item | Where it lives instead |
|------|------------------------|
| Spec YAML / markdown body | `SPEC_PATH` |
| Prototype pages | `PROTOTYPE_REF` |
| Increment blackboards | envelope `feature_spec` / `backend_spec` / `agent_spec` |
| Callee skill transcripts | discarded; envelope + artifacts |

---

## Size guards

If you are about to paste more than ~20 lines that originated in another kit, stop and pass the
path instead.

---

## HITL vs isolation

This skill and its callees run in the **main conversation** so `AskUserQuestion` reaches the
user. Isolation is **filesystem handoff**, not `context: fork`. Do not add `context: fork`
until a forked skill’s `AskUserQuestion` is verified live.
