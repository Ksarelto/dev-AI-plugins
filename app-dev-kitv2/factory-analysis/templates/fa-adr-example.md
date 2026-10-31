---
id: ADR-001
title: The discount is part of the order total in entities/order
status: accepted
feature: FEAT-001
---

# ADR-001 — The discount is part of the order total

Worked example (file name pattern `03-architecture/adr-NNN-<slug>.md`, front matter validated by
`factory/schemas/adr.schema.json`).

## Context
Totals are computed in `entities/order/model/total.ts` and shown in three places (REQ-0002).

## Decision
Extend `calculateTotal(lines, shipping)` with an optional `discount`, clamped at zero.

## Consequences
One place computes totals; the half-even rounding guarantee stays covered by existing tests.
