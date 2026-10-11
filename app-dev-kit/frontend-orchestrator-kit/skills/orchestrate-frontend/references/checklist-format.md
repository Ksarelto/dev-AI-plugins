# Checklist Format — `task-checklist.md`

**Written by**: `scripts/build-checklist.mjs` (Station 2a, create) and `scripts/update-checklist.mjs`
(Station 3 status + log, run by the `orchestrate-frontend` skill)
**Read by**: `orchestrate-frontend` skill, on every invocation (Station 0 resume check)
**Location**: `.spec/app/task-checklist.md` when the spec lives under `.spec/spec/`. The checklist
stays in the shared folder. A later spec (`metadata.parent-spec`) appends features. A shipped
feature is reopened when `changes.json` lists its slice or screen as modified, or when the spec
gains a screen that feature did not have. Identity is `source-spec` plus `slice-ref`, not the slice id alone.
Legacy specs under `.spec/app/spec-{timecode}_{slug}/` still keep the checklist beside `spec.md`.

---

## Shape

Hybrid YAML front matter (machine state) + Markdown body (human-readable log), same convention as
spec-dev-kit's `spec.md`.

`checklist-version` is `"1.2"` when the checklist was built from a spec 2.0 delivery plan
(features and tasks carry `slice-ref`; features carry `depends-on`; tasks carry `api-refs`), and
`"1.1"` for a 1.x spec.

```yaml
---
checklist-version: "1.2"
spec-ref: ".spec/spec/spec-{tc}_{slug}/spec.md"
prototype-ref: ".spec/prototype/{proto-tc}_{slug}/"  # html-generator's NEW timecode; empty if skipped
generated: "YYYY-MM-DDTHH:mm:ssZ"
updated: "YYYY-MM-DDTHH:mm:ssZ"   # any status write; not used for the spec-newer check
derived: "YYYY-MM-DDTHH:mm:ssZ"   # last build-checklist write. Missing → readers use updated
approved: ""                      # ISO time once Station 2a approves. Missing + any non-pending row → treat as approved
approved-spec-ref: ""             # spec-ref at approval time
preflight: ""                     # "accepted <ISO>" after Continue anyway. Missing → not accepted

features:
  - id: F-001
    title: Sign in
    slug-hint: sign-in            # kebab of the feature title; never app metadata.slug
    slice-ref: SL-001             # 1.2 only — the spec delivery slice this feature builds
    depends-on: []                # 1.2 only — feature ids that must be done first
    story-refs: [US-001]
    priority: must                # must | should | could  (wont is never listed)
    status: pending               # pending | in-progress | done | blocked | skipped
    slug: ""                      # feature-dev slug once the run starts
    branch: ""                    # feature/<slug> once resolved
    parent-branch: ""             # branch this one was cut from
    blocked-reason: ""
    rerun: false                  # true after one missing envelope; cleared on the next status write
    source-spec: spec-20260101-000001_app   # folder name of the spec that added this feature
    tasks:
      - id: T-001
        title: Sign in
        slice-ref: SL-001         # 1.2 only
        screen-ref: SCR-001
        story-refs: [US-001]
        ac-refs: [AC-001]
        entity-refs: [Session]
        api-refs: [API-001]       # 1.2 only — endpoints the screen calls
        status: pending           # follows the feature; blocked if the source screen disappears
        blocked-reason: ""
        change: ""                # remove — delete the existing page instead of rebuilding it
---
```

A feature is one delivery slice (2.0) — or, for a 1.x spec, one user story plus the screens whose
acceptance criteria belong to that story. Nested tasks stay screen-level. `slug`, `branch`, and `parent-branch` live on the feature.
A legacy checklist that still has a flat `tasks[]` list is re-derived into this shape.

## Body (appended, never rewritten)

```markdown
## Log

- {ISO timestamp} — checklist generated from {spec-ref} ({N} features, {M} tasks)
- {ISO timestamp} — F-001 status: pending → in-progress
- {ISO timestamp} — F-001 status: in-progress → done (slug: sign-in, branch: feature/sign-in, parent: develop)
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
   └──► skipped                           (human at Station 2a or between-feature prompt)
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
| `features[].id` | Unique, `F-` prefixed, sequential at first generation |
| `tasks[].id` | Unique, `T-` prefixed, stable across re-derivation |
| `status` | One of the five lifecycle values above (on the feature; nested tasks follow it) |
| `slug` / `branch` | Must be non-empty on the feature when `status: done` |
| `blocked-reason` | Must be non-empty when `status: blocked` |
| `spec-ref` | Must point to a file that exists |

`read-checklist.mjs --summary` prints `ERROR` for a duplicate id, a `done` row with no branch, or a
`blocked` row with no reason, and `WARN stale-envelope` / `WARN orphan-board` when a result file or
a done board does not match the checklist. Station 0 refuses to resume while any `ERROR` line is
present — surface it and ask the human to fix or regenerate. `build-checklist.mjs --dry-run` prints
the kept / appended / reopened / adopted counts without writing. A missing optional field above is
the legacy value: no `derived` means compare against `updated`; no `approved` with any row that is
not `pending` means the checklist was approved before this field existed.
