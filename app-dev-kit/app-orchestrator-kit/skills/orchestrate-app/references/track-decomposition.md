# Track decomposition — from spec to work-plan

`scripts/analyze-capabilities.mjs` implements this algorithm. The parent never parses
`spec.md` in chat.

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

1. Each `entities[]` entry whose name appears in an endpoint/mutation path, body, or description,
   plus endpoints whose path mentions that name.
2. Remaining endpoints grouped by the first non-version path segment (`/v1/orders/{id}` → `orders`).
3. Title = entity name or kebab resource. `slug-hint` = kebab of that title.
4. `priority` = max of matching stories, else `should`.

---

## Agent tasks (`A-*`)

One task per `agent-surface.agents[]` row (`agent-ref` = `AGT-00N`). If the track is only
heuristic (`confidence: low`) and the human keeps it, emit a single `A-001` titled from the
matching story.

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
