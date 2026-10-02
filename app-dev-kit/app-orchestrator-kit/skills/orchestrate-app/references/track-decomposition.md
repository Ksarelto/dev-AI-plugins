# Track decomposition — from spec to work-plan

`scripts/analyze-capabilities.mjs` implements this algorithm. The parent never parses
`spec.md` in chat.

---

## Spec 2.0 — the delivery plan is the work breakdown (preferred)

When the spec has `delivery-plan.slices` (spec-dev-kit schema 2.0), no entity or keyword matching
is done:

| Item | Rule |
|------|------|
| Track needed | the track appears in some slice's `tracks` |
| `B-*` task | one per slice whose `tracks` include `backend`: `title` = slice title, `slice-ref`, `entity-refs` / `api-refs` / `story-refs` from the slice, `ac-refs` = ACs of those stories, `depends-on` = the `B-*` ids of the slice's `depends-on` |
| `A-*` task | one per `AGT-*` id in the `agent-refs` of a slice whose `tracks` include `agent`; `depends-on` = that slice's `B-*` task |
| Order | slice order inside each track (never re-sorted by priority) |
| Reopen | a `done` task reopens when its slice id is in `changes.slices.modified`, or any of its entities, endpoints, agents, stories, or ACs changed |
| Stable ids | keyed by `slice-ref` (+ `agent-ref` for A-tasks) |
| 1.x → 2.0 upgrade | prior entity-keyed tasks are kept as history: `done` stays `done`, anything else becomes `skipped` (`blocked-reason: superseded by delivery-plan slices`). They are never queued as `change: remove` |

Each callee receives `SLICE_REF` and reads `{spec dir}/slices/{SLICE_REF}.yaml` — the build brief
spec-dev-kit writes at publish (rules, state machines, permissions, notifications, steps, done-when).
`work-plan-version` is `1.1` for a slice-based plan.

The sections below describe the **1.x fallback**.

---

## Track needed?

| Track | `needed: true` when |
|-------|---------------------|
| `frontend` | `ui-surface.screens.length > 0` |
| `backend` | `api-surface.endpoints` or `mutations` nonempty **or** `entities[]` nonempty |
| `agent` | `agent-surface.agents` nonempty. Else keyword heuristic on story / context text (`agent`, `assistant`, `rag`, `chatbot`, `llm`, `openrouter`, `retrieval`, `tool-call`) with `confidence: low` — human must confirm |

---

## Backend tasks (`B-*`)

One task per **resource**:

1. One task per `entities[]` entry; its `api-refs` are the endpoints whose longest matching path
   segment is that entity (`profile`, `profiles`, `profil-ies`). Endpoints and mutations are one
   list, de-duplicated by id.
2. Remaining endpoints grouped by the first non-version path segment (`/v1/orders/{id}` → `orders`).
3. Title = entity name or kebab resource. `slug-hint` = kebab of that title.
4. `priority` = max of matching stories, else `should`.

---

## Agent tasks (`A-*`)

One task per `agent-surface.agents[]` row (`agent-ref` = `AGT-00N`). If the track is only
heuristic (`confidence: low`) and the human keeps it, a single task `heuristic-agent` with
`agent-ref: AGT-heuristic` is emitted — the human must add the agent to the spec (or skip the
track); agent-dev cannot import an agent that the spec does not define.

## Ordering (1.x)

Tasks sort by track, then priority. Backend tasks are then ordered topologically by
`entities[].relationships[].entity` (a related entity is built first); a cycle falls back to
priority order.

---

## Stable ids

Re-derivation preserves `id` → `entity` / `agent-ref` / resource key. A removed source whose
task was `done` becomes `pending` with `change: remove`. An unfinished removed source becomes
`blocked` (reason: source removed). `skipped` rows are dropped. Story text is matched on
`i-want` and `so-that` only, not the `as` role. A `done` task reopens when its entity, endpoint,
story, or acceptance criterion is in `changes.json`.

---

## Frontend

This script does **not** emit `T-*` tasks. `frontend-orchestrator-kit` derives the UI checklist.
