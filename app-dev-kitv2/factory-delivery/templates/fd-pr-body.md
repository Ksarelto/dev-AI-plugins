# feat: Coupons at checkout (FEAT-001)

## Summary
Customers can apply one coupon per order at checkout; the order total subtracts the discount.
Delta: ADDED REQ-0001 (coupon at checkout) · MODIFIED REQ-0002 (order total) · REMOVED none

## Spec trace
| AC | Criterion | Story | Task | Tests | Result |
|---|---|---|---|---|---|
| AC-0001 | Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line | STORY-0001 | TASK-003 | TEST-0001 | passing |
| AC-0003 | Total is sum(lines) - discount + shipping, rounded half-even to 2 decimals | STORY-0002 | TASK-002 | TEST-0003 | passing |

## Verification
| Gate | Result | Rounds | Note |
|---|---|---|---|
| acceptance | ✅ | 1 | 2 tests, both failing before implementation |
| impl (per task) | ✅ | 3 tasks | — |
| verify | ✅ | 1 | — |
| GATE-A / GATE-B | approved | — | by a human |

## Review and QA
- RV-2 (P3, over-engineering): …
- No open S1/S2 defects.

## Human notes
- HD-2 "Hide the coupon field for guest users" → TASK-003

## Docs
- docs/features/FEAT-001-coupons-at-checkout.md, docs/adr/adr-001-…, CHANGELOG.md

## Diff
 src/entities/order/model/total.ts | 12 ++++++++----
 src/features/apply-coupon/ui/coupon-field.tsx (new, 48 lines)

## Open items
- OQ-1 answered with its default: coupons do not stack with the loyalty discount.

## Provenance
Factory run FEAT-001 · 19 dispatches · models: opus (requirements, architecture, planning, review), sonnet (build), haiku (intake, docs) · 1.7M tokens · 105 min agent time
