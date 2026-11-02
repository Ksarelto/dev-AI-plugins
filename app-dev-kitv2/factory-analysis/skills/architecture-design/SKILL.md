---
name: architecture-design
description: Procedure for the factory solution-architect — place a feature inside the stack's reference architecture as a component map with reuse decisions and ADRs, or write the app profile when bootstrapping a new app. Preloaded by the solution-architect; not for direct use.
user-invocable: false
---

# Architecture design

Runs on: solution-architect (opus) — deciding where a feature's behaviour lives in an existing
reference architecture, and what to reuse, before anyone writes code.

Reuse ladder, placement per stack, field rules, ADR rules, prototype evidence and the bootstrap
table: [fa-architecture-rules.md](references/fa-architecture-rules.md).

## Bootstrap (stage `bootstrap`, new app)

Write `.factory/app-profile.yaml` ([fa-app-profile.yaml](../../templates/fa-app-profile.yaml)):

1. Read the normalised sources, `coverage.yaml` and `factory.config.yaml` (T2).
2. `name`, a one-sentence `goal`, `scope` (the user-visible areas the sources name), and
   `out_of_scope` only from the sources.
3. `components`: one key per enabled role, `{ stack, path }` from the config.
4. `nfr` only where a source states a target; `conformance: conformant`; `origin: greenfield`.
5. Run the exit check (`gate profile`, schema only) and return.

## Component map (stage `architecture`)

You go first in this stage; the contract-steward writes `api-contract.yaml` after you, and an
architect of an enabled role (the ai-architect) writes `agent-design.md`. Exit-check failures about
those files are expected now (T0 says so).

1. **Load the stack knowledge.** T1 lists, per enabled role, the stack skills to load with the Skill
   tool as reference (`frontend-dev-kit:architecture-audit`, `node-backend-dev-kit:architecture-audit`)
   and the stack's rules. Read the rules the feature touches. Use them as knowledge only: run none
   of their fixes, sub-agents or questions.
2. **Read the inputs** (T2): the spec, `stories.yaml`, `ux-notes.md`, the app profile (conformance
   and its notes), the capability map, the component inventory and, when present, the prototype
   report and screen notes.
3. **List what each story needs**: the screens, the actions, the business rules, the data, the API
   calls. One story usually needs a few components across layers.
4. **Climb the reuse ladder** for each need: `existing` → `extend` → `new` composed of existing
   parts → `new`. Check the inventory first, then the capability map's folders with a scoped Grep.
5. **Place each component** in one layer of its stack's reference architecture; set `role` when
   several roles are enabled; keep each `path` inside that role's `owns_paths`.
6. **Write the front matter** ([fa-component-map.md](../../templates/fa-component-map.md)): every
   story owned by a component, every component owning a story, `reuse_considered` and a real
   `reuse_rejected` for each `new` one, `contract_ops` for every API operation the feature calls or
   adds.
7. **Write ADRs** for the decisions a later reader would question (next free ADR IDs, one file
   each, [fa-adr-example.md](../../templates/fa-adr-example.md)) and list them in `decisions`.
8. **Write the body**: data flow, state location, error flow to the ACs' copy, adapter-mode areas,
   unchanged guarantees each extended module keeps.
9. **Map human notes** that concern design (`notes_mapped` to the ADR or mention the ID).
10. Run the exit check from T0; fix every failure that is yours.

## Using prototype evidence

When `02b-prototype/prototype-report.yaml` exists, the human approved it at GATE-P:

- each screen in `screens` is a page-level component for the stories it lists;
- parts several screens show are candidates for one shared component — decide reuse on them;
- non-breaking `spec_delta` entries are design evidence; cite them in the body or an ADR;
- never cite sandbox files as `existing` paths, never copy prototype markup.

## What the architecture gate checks

| Rule | Failure |
|---|---|
| front matter valid against `component-map.schema.json` | `schema` |
| component names unique | `duplicate` |
| each component's stories exist; every story has a component | `unknown-story`, `story-without-component` |
| `existing` / `extend` paths exist | `missing-path` |
| `new` lists `reuse_considered` and a real `reuse_rejected` (4+ words, not n/a) | `nothing-considered`, `no-reason` |
| every ADR in `decisions` has a file; ADR front matter valid | `missing-adr`, `schema` |
| every `contract_ops` entry is defined in `api-contract.yaml` | `unknown-operation` |
| an enabled role with an architect has `agent-design.md` | `missing` (the ai-architect's file) |
| contract rules | see `api-contract` |

The stage tracks human notes: each open `HD-n` must be mapped or mentioned in the outputs.

## Mini example

STORY-0004 lets a customer reorder from "My orders". The inventory has `order` (entities, used by 9)
and `data-table` (shared/ui, used by 11); no reorder action exists.

```yaml
- { name: order, path: src/entities/order, layer: entities, stories: [STORY-0004], reuse: extend, reuse_considered: [entities/order], reuse_rejected: null }
- name: ReorderButton
  path: src/features/reorder/ui/reorder-button.tsx
  layer: features
  stories: [STORY-0004]
  reuse: new
  reuse_considered: [shared/ui/button, features/add-to-cart]
  reuse_rejected: "add-to-cart adds one line; reorder adds every line of an order and reports skipped parts"
```

`order` gains a `reorderLines` mapper (extend, no fork); the order table stays `data-table` with a
new action column. An ADR records why skipped lines are reported by the feature, not the entity.
