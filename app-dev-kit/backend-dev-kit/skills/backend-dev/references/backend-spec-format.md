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
upstream-spec: .spec/app/spec-{tc}_{slug}/spec.md
task-id: B-001
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
| `## Contract Hints` | interpreter (prototype path only) |
| `## Reuse Map` | hub Station 1 |
| `## Dependencies` | hub |
| `## Build Plan` | hub Station 2 |
| `## Gate Log` | quality-gate-runner |
| `## Human Review` | hub |
| `## Decisions & Open Questions` | any |

Hub may write **only** this file. Never `src/`.
