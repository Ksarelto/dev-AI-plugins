---
name: delta-spec
description: Procedure for the factory requirements-analyst on an existing app — write delta-spec.yaml accounting for added, modified and removed behaviour against the discovered baseline, with protected guarantees. Preloaded by the requirements-analyst; not for direct use.
user-invocable: false
---

# Delta-spec for an existing app

Runs on: requirements-analyst (opus; sonnet in the patch tier) — specifying a change to software
that already works, without re-specifying or breaking what exists.

The single most important artifact for not rewriting working software. Write
`01-requirements/delta-spec.yaml` ([fa-delta-spec.yaml](../../templates/fa-delta-spec.yaml)) and, in
the requirements stage only, `01-requirements/completeness.yaml`. The patch tier
(`requirements-lite`) writes no completeness file; the planner runs right after you there.

The analysis, writing and completeness rules are the PRD's:
[fa-analysis-steps.md](../prd-authoring/references/fa-analysis-steps.md),
[fa-spec-writing.md](../prd-authoring/references/fa-spec-writing.md),
[fa-completeness.md](../prd-authoring/references/fa-completeness.md). Asking:
[fa-clarification-protocol.md](../guided-interview/references/fa-clarification-protocol.md).

## 1. Read the baseline first

| File (T2) | Tells you |
|---|---|
| `app-profile.yaml` | goal, scope, stacks, conformance and its `notes` |
| `_index/capability-map.yaml` | each existing capability: paths, routes, summary |
| `ledger/feature-ledger.yaml` | what was discovered or delivered, with REQ IDs when the factory built it |
| normalised sources + `coverage.yaml` | what is asked for now |

Before writing a requirement, find the capability it touches. A behaviour that already exists is
**modified**, never added again. A paragraph that only describes today's app ("today the export
runs nightly") is context: `sources_not_used`, reason `context: current behaviour`.

## 2. Mode

- `change-request` — the request changes or removes existing behaviour.
- `brownfield-extend` — it only adds capabilities. `modified` and `removed` are then `[]`.

The engine detected a mode (T0); trust the sources over it and say so in the summary when you differ.

## 3. The three lists

| List | Holds | Rules |
|---|---|---|
| `added` | new capabilities | the PRD requirement shape: `id`, `text`, `sources`, `priority`, `acs` with `kind` |
| `modified` | existing behaviour that changes | `before` and `after`, one sentence each, as observable behaviour; `affected` lists the existing files that implement it; `acs` for the new behaviour |
| `removed` | behaviour that goes away | `id`, `reason`, `affected`, `sources`; always present — `[]` means "confirmed nothing is removed", which the human checks at GATE-A |

### `affected` paths

- Every path must exist in the project (the gate fails `phantom-file`). Take them from the
  capability map's `paths`; open a file only to confirm it holds the behaviour.
- List the files whose behaviour changes, not every importer. Name tests that pin the old behaviour
  too (an e2e spec, an existing unit test): the planner must update them.
- A task that edits an `affected` file must depend on a characterisation task — the plan gate
  enforces it — so a missing path means untested change later.

### `before` / `after`

Write both as behaviour a test can observe:

```yaml
before: Order total = sum(lines) + shipping
after: Order total = sum(lines) - discount + shipping, discount >= 0
```

The ACs prove `after`. `before` is what the characterisation task pins.

## 4. Protect what must not change

`unchanged_guarantees` lists behaviour near the change that must keep working: rounding, permission
checks, existing validations, totals shown elsewhere, URLs other systems call. Each entry is one
observable sentence. The planner covers every one in the characterisation task's definition of
done, so a guarantee you leave out is a regression nobody tests.

Good candidates: anything in an `affected` file that the change does not mean to alter; every
behaviour a `modified` requirement's `before` keeps; data other features read.

## 5. Removals

For each removed behaviour: the REQ ID it had (from the ledger) or a new one, the `reason`, the
`affected` files and the `sources` that ask for the removal. Removing a public API or data is a
human-owned decision (`policy.human_owned: public_api_removal`): add a `major` open question when
the sources do not state that consumers agreed.

## 6. Acceptance criteria, NFRs and questions

The PRD rules apply ([fa-spec-writing.md](../prd-authoring/references/fa-spec-writing.md)): `kind` on
every AC, an unhappy-path AC on every `must` requirement (added or modified), measurable wording,
exact values, open questions with `severity` and `default`. `non_functional` is optional in a
delta-spec — add an NFR when the change affects performance, accessibility or security.

## 7. Account for every source paragraph

Every SRC paragraph of the feature is cited by an `added`, `modified` or `removed` entry, or listed
in `sources_not_used` with a reason (`source-dropped` otherwise).

## 8. Completeness (requirements stage only)

`backward_compatibility` is rarely `n/a` here: credit it with the `modified` requirements, their ACs
and `unchanged_guarantees`. A category the change does not touch is `n/a` with a reason naming who
keeps it ("checkout logging is unchanged and owned by the platform team").

## What the spec gate checks (delta-spec specifics)

| Rule | Failure |
|---|---|
| valid against `delta-spec.schema.json`; `added`, `modified`, `removed`, `open_questions` present | `schema` |
| every `modified[].affected` path exists | `phantom-file` |
| removed IDs unique with the rest of the spec | `duplicate` |
| plus every PRD rule except the required NFR categories and the backlog | see `prd-authoring` |

## Mini example (change request)

```yaml
modified:
  - id: REQ-0002
    before: Order total = sum(lines) + shipping
    after: Order total = sum(lines) - discount + shipping, discount >= 0
    sources: [SRC-002]
    affected: [src/entities/order/model/total.ts]
    acs:
      - { id: AC-0003, kind: happy, text: "Total is sum(lines) - discount + shipping, rounded half-even to 2 decimals" }
removed: []
unchanged_guarantees: ["Totals are rounded half-even to 2 decimals"]
```

Run the exit check from T0 before you return.
