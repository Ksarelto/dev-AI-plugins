---
name: feature-docs
description: Procedure for the factory tech writer — write the feature doc with every acceptance criterion, promote the feature's ADRs to docs/adr, add a CHANGELOG entry and a docs report. Preloaded by the tech-writer; not for direct use.
user-invocable: false
---

# Feature docs (S8a)

## 1. `docs/features/<feature-id>-<slug>.md`

```markdown
# Coupons at checkout (FEAT-001)
What it does, for whom, in two or three sentences.

## Acceptance criteria
- AC-0001 — Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line
…every AC of the spec, with its exact text

## Screens and endpoints
## How to test it
## Decisions — links to docs/adr/
```

The docs gate fails if any AC of the spec is missing, or a removed REQ (delta-spec `removed`) is
not named with what was taken out.

## 2. ADRs

Copy each `03-architecture/adr-*.md` of the feature to `docs/adr/` (keep the file name and the ID).
Do not edit an ADR's decision; add a "Status" line if it was superseded.

## 3. `CHANGELOG.md`

Add one line under the top "Unreleased" heading (create it if missing), naming the feature ID:
`- Coupons at checkout: apply one coupon per order (FEAT-001)`.

## 4. `08-delivery/docs-report.md`

List every file you created or changed and anything you could not document (with the reason).

Run the exit check from T0 before you return.
