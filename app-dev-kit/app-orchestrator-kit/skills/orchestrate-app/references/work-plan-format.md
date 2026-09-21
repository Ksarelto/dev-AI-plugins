# Work-plan format — `work-plan.md`

**Written by**: `scripts/analyze-capabilities.mjs` (Station 2a) and the `orchestrate-app` skill
(track/task status updates).
**Read by**: `orchestrate-app` on every invocation (Station 0).
**Location**: `.spec/app/spec-{tc}_{slug}/work-plan.md` — beside the `spec.md` it was derived from.

Hybrid YAML front matter + append-only Markdown `## Log`.

```yaml
---
work-plan-version: "1.0"
spec-ref: ".spec/app/spec-{tc}_{slug}/spec.md"
prototype-ref: ".spec/prototype/{proto-tc}_{slug}/"
generated: "YYYY-MM-DDTHH:mm:ssZ"
updated: "YYYY-MM-DDTHH:mm:ssZ"

tracks:
  - id: backend
    needed: true
    confidence: high          # high | low
    status: pending           # pending | in-progress | done | skipped | blocked
    entry: backend-dev-kit:backend-dev
    result: ""                # kit-result path once the track finishes
    blocked-reason: ""
  - id: agent
    needed: false
    confidence: high
    status: skipped
    entry: agent-dev-kit:agent-dev
    result: ""
    blocked-reason: ""
  - id: frontend
    needed: true
    confidence: high
    status: pending
    entry: frontend-orchestrator-kit:orchestrate-frontend
    result: ""
    blocked-reason: ""

tasks:
  - id: B-001
    track: backend
    title: Profile
    entity-refs: [Profile]
    api-refs: [API-001]
    agent-ref: ""
    story-refs: [US-001]
    ac-refs: [AC-001]
    priority: must
    slug-hint: profile
    status: pending
    slug: ""
    branch: ""
    blocked-reason: ""
---
```

Frontend `T-*` tasks live in `task-checklist.md` (frontend-orchestrator-kit). This file only
lists `B-*` and `A-*` increment tasks plus track-level frontend status.

## Status lifecycle

Same as the frontend checklist: `pending` → `in-progress` → `done` / `pending` (abort) /
`blocked` (error) / leave `in-progress` (missing envelope). Only a human writes `skipped`.
