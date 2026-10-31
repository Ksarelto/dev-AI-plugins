---
name: delta-spec
description: Procedure for the factory requirements-analyst on an existing app — write delta-spec.yaml accounting for added, modified and removed behaviour against the discovered baseline, with protected guarantees. Preloaded by the requirements-analyst; not for direct use.
user-invocable: false
---

# Delta-spec for an existing app

The single most important artifact for not rewriting working software. Write
`01-requirements/delta-spec.yaml` following [fa-delta-spec.yaml](../../templates/fa-delta-spec.yaml).

## Read the baseline first

`app-profile.yaml`, the capability map and the feature ledger tell you what exists. A requirement
that already exists is **modified**, not added again.

## The three lists

| List | Holds | Rules |
|---|---|---|
| `added` | new capabilities | same shape as a PRD requirement: text, sources, ACs |
| `modified` | existing behaviour that changes | `before` and `after` in one sentence each; `affected` lists the existing files (they must exist — the gate checks); new ACs for the new behaviour |
| `removed` | behaviour that goes away | always present; `[]` means "confirmed nothing is removed" and the human checks that at GATE-A |

`mode` is `change-request` when the request changes existing behaviour, `brownfield-extend` when it
only adds.

## Protect what must not change

`unchanged_guarantees` lists behaviour the change must not break (rounding, permissions, existing
validations). The planner turns each into characterisation tests when they are not covered yet.

## Acceptance criteria and questions

Same rules as a PRD: measurable ACs with exact values, open questions with a severity and a default,
sources on every requirement, and every SRC paragraph of the feature either cited or listed in
`sources_not_used` with a reason (a "today the app does X" paragraph is context). See `prd-authoring` for examples of weak versus measurable ACs.

Run the exit check from T0 before you return.
