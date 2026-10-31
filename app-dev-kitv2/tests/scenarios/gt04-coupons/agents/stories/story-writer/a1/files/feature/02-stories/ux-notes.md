# UX notes — coupons at checkout

## CheckoutSummary — coupon field (STORY-0001)
| State | What the user sees |
|---|---|
| hidden | guests see no coupon field at all (HD-2) |
| empty | "Coupon code" input, "Apply" disabled until text is entered |
| loading | spinner on "Apply" |
| applied | "-10.00 EUR" discount line (AC-0001) |
| invalid | inline "This coupon has expired"; total unchanged (AC-0002) |
| not-combinable | inline "Coupons cannot be combined with the loyalty discount" (AC-0004, HD-1) |
