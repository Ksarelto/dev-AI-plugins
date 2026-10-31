# feat: Coupons at checkout (FEAT-001)

## Summary
Customers can apply one coupon per order at checkout; the order total subtracts the discount.

## Spec trace
| AC | Story | Task | Tests | Result |
|---|---|---|---|---|
| AC-0001 | STORY-0001 | TASK-003 | TEST-0001 | passing |
| AC-0003 | STORY-0002 | TASK-002 | TEST-0003 | passing |

## Review and QA
- RV-2 (P3, over-engineering): …
- No open S1/S2 defects.

## Human notes
- HD-2 "Hide the coupon field for guest users" → TASK-003

## Docs
- docs/features/FEAT-001-coupons-at-checkout.md, docs/adr/ADR-001-…, CHANGELOG.md

## Provenance
19 dispatches · models: opus (requirements, architecture, planning, review), sonnet (build), haiku (intake, digests, docs) · 1.7M tokens · 105 min agent time
