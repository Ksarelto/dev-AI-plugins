# Coupons at checkout (FEAT-001)
Returning B2B customers apply one coupon per order at checkout; the total subtracts the discount.

## Acceptance criteria
- AC-0001 — Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line
- AC-0002 — Applying an expired coupon shows "This coupon has expired" and leaves the total unchanged
- AC-0003 — Lines 60.00 + 40.00 EUR, discount 10.00, shipping 5.00 give a total of 95.00 EUR
- AC-0004 — A loyalty discount blocks coupons with "Coupons cannot be combined with the loyalty discount"

## Decisions
- [ADR-001](../adr/adr-001-discount-in-total.md)
