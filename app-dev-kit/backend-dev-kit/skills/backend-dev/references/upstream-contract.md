# Upstream contract — backend-dev-kit

One `/backend-dev` run imports **one resource** from a spec-dev-kit `spec.md`.
Dumping every `api-surface` endpoint into one blackboard is invalid when `type: app`.

Canonical YAML: spec-dev-kit `references/spec-schema.md` (1.2).
Task derivation: app-orchestrator-kit `references/track-decomposition.md`.

## Spawn payload

| Field | Required | Meaning |
|-------|----------|---------|
| `REQUEST` | no, when `UPSTREAM_SPEC` + `TASK_ID` | One line. Never paste spec YAML |
| `UPSTREAM_SPEC` | preferred | Path to `spec.md` |
| `TASK_ID` | from orchestrator | `B-001` |
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
| `entities[]` | `## Data Model` | `ENTITY_REFS` |
| `api-surface` | `## API Contract` | `API_REFS` or paths mentioning kept entities |
| `user-stories` / `acceptance-criteria` | `## Acceptance Criteria` | `STORY_REFS` / `AC_REFS` |
| Prototype | `## Contract Hints` | `page-map.json` page whose screen components mention the entity — path only |

`--require-scoped` fails when `type: app` (or >1 entity) and no `TASK_ID` / `ENTITY_REFS` / `API_REFS`.
