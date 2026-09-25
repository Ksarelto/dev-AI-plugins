# App state — `.spec/app/`

Shared pointers. Kit outputs stay in their own folders. A fresh session reads this file and
does not replay chat.

```
.spec/app/current.json
.spec/app/increments/INC-00N.json
.spec/app/task-checklist.md    # frontend-orchestrator-kit
.spec/app/work-plan.md         # app-orchestrator-kit
.spec/spec/{spec-id}/spec.md   # spec-dev-kit
.spec/prototype/{proto-id}/    # html-generator-kit
.spec/processed/{spec-id}/     # context files consumed by that spec run
.spec/context/                 # inbox only; empty after publish
```

`spec-id` is `spec-{YYYYMMDD-HHmmss}_{app-slug}`. `proto-id` is `{YYYYMMDD-HHmmss}_{app-slug}`.

`current.json`:

```json
{
  "slug": "campus",
  "spec_path": ".spec/spec/spec-20260101-000001_campus/spec.md",
  "spec_id": "spec-20260101-000001_campus",
  "prototype_ref": ".spec/prototype/20260101-000001_campus",
  "prototype_id": "20260101-000001_campus",
  "next_ids": { "US": 2, "SCR": 2, "AC": 2, "INT": 1, "API": 1, "AGT": 1, "TOOL": 1 },
  "increment_id": "INC-001"
}
```

`increments/INC-00N.json` records `parent_spec_path` and `parent_prototype_ref` so
`revert-increment.mjs` can point `current.json` back without deleting the new folders.
