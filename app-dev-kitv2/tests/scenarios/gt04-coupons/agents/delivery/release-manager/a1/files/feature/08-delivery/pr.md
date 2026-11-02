# feat: Coupons at checkout (FEAT-001)

## Summary
Customers apply one coupon per order at checkout; the total subtracts the discount.

## Spec trace
| AC | Story | Task | Tests | Result |
|---|---|---|---|---|
| AC-0001 | STORY-0001 | TASK-003, TASK-004 | TEST-0001, acceptance | passing |
| AC-0002 | STORY-0001 | TASK-003 | TEST-0002, acceptance | passing |
| AC-0003 | STORY-0002 | TASK-002, TASK-004 | TEST-0003, TEST-0006, acceptance | passing |
| AC-0004 | STORY-0001 | TASK-003 | TEST-0004, acceptance | passing |

## Review and QA
- RV-3 (P3): ApplyResult could live in the model folder. DEF-001 (S3): leading spaces are not trimmed.

## Docs
- docs/features/FEAT-001-coupons-at-checkout.md, docs/adr/adr-001-discount-in-total.md, CHANGELOG.md

## Provenance
Scripted golden run.
