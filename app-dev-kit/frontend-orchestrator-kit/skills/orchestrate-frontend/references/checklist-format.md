# Checklist Format — `task-checklist.md`

**Written by**: `scripts/build-checklist.mjs` (Station 2a, create) and the `orchestrate-frontend` skill
(Station 3, status updates)
**Read by**: `orchestrate-frontend` skill, on every invocation (Station 0 resume check)
**Location**: `.spec/app/spec-{timecode}_{slug}/task-checklist.md` — alongside the `spec.md` it was
derived from, so the two never drift apart or get orphaned independently.

---

## Shape

Hybrid YAML front matter (machine state) + Markdown body (human-readable log), same convention as
spec-dev-kit's `spec.md`.

```yaml
---
checklist-version: "1.0"
spec-ref: ".spec/app/spec-{tc}_{slug}/spec.md"
prototype-ref: ".spec/prototype/{proto-tc}_{slug}/"  # html-generator's NEW timecode; empty if skipped
generated: "YYYY-MM-DDTHH:mm:ssZ"
updated: "YYYY-MM-DDTHH:mm:ssZ"

tasks:
  - id: T-001
    title: ""                     # from screen title, or story summary for screen-less tasks
    screen-ref: SCR-001           # empty for screen-less tasks
    story-refs: [US-001, US-002]
    ac-refs: [AC-001, AC-002]
    entity-refs: [Profile]
    priority: must                # must | should | could  (wont is never listed)
    status: pending                # pending | in-progress | done | blocked | skipped
    slug-hint: sign-in            # kebab screen/story title for feature-dev; never app metadata.slug
    slug: ""                      # feature-dev-kit slug once a run starts (screen-task, not the app slug)
    branch: ""                    # feature-dev-kit branch once resolved
    blocked-reason: ""            # only set when status: blocked
---
```

## Body (appended, never rewritten)

```markdown
## Log

- {ISO timestamp} — checklist generated from {spec-ref} ({N} tasks)
- {ISO timestamp} — T-003 status: pending → in-progress
- {ISO timestamp} — T-003 status: in-progress → done (slug: decline-profile, branch: feature/decline-profile)
```

The log is append-only — it is the audit trail for "what happened when", which the YAML `status`
field alone does not capture (it only says *what*, not *when* or *why* for a `blocked` task).

---

## Status Lifecycle

```
pending ──► in-progress ──► done          (envelope outcome: approved)
   │             │
   │             ├──► pending             (envelope outcome: aborted — human declined)
   │             ├──► blocked             (envelope outcome: error, or dirty-tree abort)
   │             └──► in-progress         (no envelope — crash; resume re-offers)
   │
   └──► skipped                           (human at Station 2a or between-task prompt)
   │
   └──► blocked                           (source screen removed on re-derivation)
```

Only the orchestrator writes `in-progress` / `done` / `pending`-on-abort / `blocked`-on-error.
Only a human decision (via `AskUserQuestion`) writes `skipped`. `build-checklist.mjs` writes
`blocked` for the removed-screen case in `references/task-decomposition.md`.

---

## Validation rules

| Field | Rule |
|-------|------|
| `id` | Unique, `T-` prefixed, sequential at first generation |
| `status` | One of the five lifecycle values above |
| `slug` / `branch` | Must be non-empty when `status: done` |
| `blocked-reason` | Must be non-empty when `status: blocked` |
| `spec-ref` | Must point to a file that exists |

`build-checklist.mjs` enforces these on write; the orchestrate-frontend skill re-checks them on read
before resuming (Station 0) and refuses to resume a checklist that fails validation — surface the
error and ask the human to fix or regenerate it.
