# Upstream contract — backend-dev-kit

One `/backend-dev` run imports **one resource** from a spec-dev-kit `spec.md`.
Dumping every `api-surface` endpoint into one blackboard is invalid when `type: app`.

Canonical YAML: spec-dev-kit `references/spec-schema.md` (2.0; 1.x still read).
What each kit reads, and in what order: spec-dev-kit `references/consumer-contract.md`.
Task derivation: app-orchestrator-kit `references/track-decomposition.md`.

## Spawn payload

| Field | Required | Meaning |
|-------|----------|---------|
| `REQUEST` | no, when `UPSTREAM_SPEC` + `TASK_ID` | One line. Never paste spec YAML |
| `UPSTREAM_SPEC` | preferred | Path to `spec.md` |
| `TASK_ID` | from orchestrator | `B-001` |
| `SLICE_REF` | spec 2.0 | Delivery slice, e.g. `SL-002`. Import reads `{spec dir}/slices/{SLICE_REF}.yaml` (else the slice in the spec); its `entity-refs` / `api-refs` / `story-refs` are the scope unless explicit refs narrow it |
| `ENTITY_REFS` | when known | PascalCase entity names |
| `API_REFS` | when known | `API-xxx` list |
| `STORY_REFS` / `AC_REFS` | when known | scoped lists |
| `PROTOTYPE_REF` | optional | Prototype dir — form-field hint, never inlined HTML |
| `SLUG_HINT` | when no entity title | kebab resource slug |
| `RESULT_OUT` | optional | Extra `kit-result.json` copy |

## YAML to import (filtered)

| Spec field | Blackboard | Filter |
|------------|------------|--------|
| `metadata`, `context` | `## Request` | identity + short context |
| `entities[]` (fields, `values`, `derived`, `relationships.via`, `retention`) | `## Data Model` | `ENTITY_REFS`, else the slice's, else entities named by the kept endpoints |
| `api-surface.endpoints` (request, success, error codes, `roles`) | `## API Contract` | `API_REFS`, else the slice's, else paths mentioning kept entities (1.x `mutations` merged by id) |
| `user-stories` / `acceptance-criteria` | `## Acceptance Criteria` | `STORY_REFS` / `AC_REFS`, else the slice's; a scoped 1.x run without refs takes the endpoints' `story-refs`, then stories naming a kept entity, and imports every story only as a last resort (`WARN [STORIES_UNSCOPED]`) |
| `business-rules[]` | `## Business Rules` | slice `rule-refs`, or `applies-to` a kept entity / endpoint |
| `state-machines[]` | `## State Machines` | machines of kept entities |
| `permissions[]` | `## Permissions` | slice `permission-refs`, or `refs` touch a kept endpoint |
| `notifications[]` | `## Notifications` | slice `notification-refs` |
| `non-functional` (security, performance, observability, scalability) | `## Non-functional` | all |
| slice `steps` (track `backend`) | `## Slice Steps` | `SLICE_REF` only |
| open questions affecting the slice | `## Decisions & Open Questions` | `SLICE_REF` only |
| Prototype | `## Contract Hints` | `page-map.json` path only |

`--require-scoped` fails when `type: app` (or >1 entity, or >3 endpoints) and no `SLICE_REF` /
`TASK_ID` / `ENTITY_REFS` / `API_REFS`.
