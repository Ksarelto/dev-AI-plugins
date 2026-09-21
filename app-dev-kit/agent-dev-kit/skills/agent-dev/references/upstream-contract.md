# Upstream contract — agent-dev-kit

One `/agent-dev` run imports **one** `agent-surface.agents[]` row.

| Field | Meaning |
|-------|---------|
| `UPSTREAM_SPEC` | `spec.md` path |
| `TASK_ID` | `A-001` |
| `AGENT_REF` | `AGT-001` |
| `STORY_REFS` / `AC_REFS` | scoped |
| `PROTOTYPE_REF` | optional chat-page hint |
| `WORK_PLAN` | parent-owned |
| `SLUG_HINT` / `RESULT_OUT` | slug + extra envelope |

`--require-scoped` fails when `agent-surface.agents.length > 1` and no `AGENT_REF` / `TASK_ID`.

Import: that agent, its `tool-refs` / `knowledge-base-refs`, linked `api-ref` endpoints
(ids only), matching stories/ACs. Prototype bind is a path, never HTML.
