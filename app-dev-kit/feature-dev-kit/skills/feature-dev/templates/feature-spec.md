---
slug: <feature-slug>
status: draft
created: <YYYY-MM-DD>
ticket: <TICKET-ID or TBD>
branch: <feature/…>
upstream-spec: none
feature-id: none
task-id: none
screen-ref: none
prototype-ref: none
---

# Feature: <name>

<!--
Per-feature blackboard. Copied to .spec/features/<feature-slug>.md by scripts/new-feature.sh.

status ∈ draft | awaiting-clarification | investigating | awaiting-dep-approval | approved |
         building | review | awaiting-human | changes-requested | done

Every worker MUST update its owned section before returning — returning without writing is a
protocol violation. The orchestrator reads THIS file (not chat output) to decide the next station.
Canonical schema: ../references/feature-spec-format.md. Section ownership and read/write
allowlists: ../references/context-budget.md. Spawn payload: ../references/upstream-contract.md.
Packets: ../references/packets.md.
-->

## Request

<verbatim human ask — do not paraphrase>

## Clarifications

**Q**: <question asked at Station 0>
**A**: <human's answer>

## Acceptance Criteria

1. <testable outcome — a rendered state, an API call made, a validation error shown>
2. <each must be verifiable by a test or an explicit manual check>

## FSD Impact

| Slice | Layer | Segments | Change |
|-------|-------|----------|--------|
| `<slice>` | `<layer>` | `api/`, `model/`, `ui/` | new \| modified |

## API Contract / Data Model

<endpoints, request/response shapes, query keys, entity types — this screen-task only>

## UI Surface

<one screen: id, title, route, states, components. prototype-page if PROTOTYPE_REF bound>

## Architecture Baseline

<Station 1.5 REPORT_ONLY findings from architecture-auditor>

## Reuse Map

| Needed | Existing source | Reuse or extend |
|--------|----------------|-----------------|
| | | |

## Tech Investigation

<Station 1a findings from context7/web — only when an unfamiliar capability was hit>

## Dependencies

| Package | Version | Why | Size | License | Status |
|---------|---------|-----|------|---------|--------|
| | | | | | awaiting-human-approval |

## Build Plan

<written at Station 2 — see ../templates/build-plan.md>

## Gate Log

| Timestamp | Station | Gate | Result | Note |
|-----------|---------|------|--------|------|
| | | | | |

## Human Review

<Station 12 packet — see ../templates/review-packet.md>

## Decisions & Open Questions

- <decision made and why, or an unresolved item with its owner>
