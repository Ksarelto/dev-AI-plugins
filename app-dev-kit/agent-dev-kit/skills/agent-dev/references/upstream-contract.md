# Upstream contract — agent-dev-kit

One `/agent-dev` run imports **one** `agent-surface.agents[]` row.

| Field | Meaning |
|-------|---------|
| `UPSTREAM_SPEC` | `spec.md` path |
| `TASK_ID` | `A-001` |
| `SLICE_REF` | spec 2.0 delivery slice, e.g. `SL-003` — scopes stories/ACs and adds `## Slice Steps`; the agent defaults to the slice's first `AGT-*` ref |
| `AGENT_REF` | `AGT-001` |
| `STORY_REFS` / `AC_REFS` | scoped |
| `PROTOTYPE_REF` | optional chat-page hint |
| `SLUG_HINT` / `RESULT_OUT` | slug + extra envelope |

`--require-scoped` fails when `agent-surface.agents.length > 1` and no `AGENT_REF` / `TASK_ID` /
`SLICE_REF`.

Import: that agent, its `tool-refs` / `knowledge-base-refs`, each tool's `api-ref` endpoint with its
full `request` / `response` (endpoints and 1.x mutations merged by id), the business rules and
permissions on those endpoints (the agent must respect them — a tool call is a user action),
matching stories/ACs, and the slice's `agent` steps. Prototype bind is a path, never HTML.

Canonical YAML: spec-dev-kit `references/spec-schema.md` (2.0). Reading order:
spec-dev-kit `references/consumer-contract.md`.
