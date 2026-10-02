# Backend spec format (blackboard)

Path: `.spec/backend/<slug>.md`. One file = one resource increment.

## Status

`draft` → `awaiting-clarification` → `approved` (skill @ 0.5) → `building` → `review` →
`awaiting-human` → `done` (skill @ 12) | `changes-requested` | `aborted`.

## Front matter

```yaml
slug: kebab-case
status: draft
created: YYYY-MM-DD
branch: backend/<slug>
upstream-spec: .spec/spec/spec-{tc}_{slug}/spec.md
task-id: B-001
slice-ref: SL-001        # spec 2.0 delivery slice, or empty
entity-refs: [Profile]
api-refs: [API-001]
prototype-ref: ""
```

## Sections

| Section | Owner |
|---------|-------|
| `## Request` | interpreter |
| `## Clarifications` | skill |
| `## Acceptance Criteria` | analyst |
| `## Data Model` | interpreter |
| `## API Contract` | interpreter |
| `## Business Rules` | import (spec 2.0) — enforce each rule in the service with its error code |
| `## State Machines` | import (spec 2.0) — one guarded transition per row; `after` rows are jobs |
| `## Permissions` | import (spec 2.0) — `requireRole` / `requirePermission` per endpoint |
| `## Notifications` | import (spec 2.0) — emit on the listed transitions |
| `## Non-functional` | import |
| `## Slice Steps` | import (spec 2.0) — ordered build guidance; Station 2 plans from it |
| `## Contract Hints` | interpreter (prototype path only) |
| `## Reuse Map` | hub Station 1 |
| `## Dependencies` | hub |
| `## Build Plan` | hub Station 2 |
| `## Gate Log` | quality-gate-runner |
| `## Human Review` | hub |
| `## Decisions & Open Questions` | any |

Hub may write **only** this file. Never `src/`.
