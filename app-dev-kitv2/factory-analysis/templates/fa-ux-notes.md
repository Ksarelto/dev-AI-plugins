# UX notes — FEAT-001 coupons at checkout

Worked example. One section per surface named in `stories.yaml` (`ux.surfaces`), covering every state.

## CheckoutSummary — coupon field (STORY-0001)
| State | What the user sees |
|---|---|
| empty | "Coupon code" input and an "Apply" button, disabled until text is entered |
| loading | button shows a spinner; input is read-only |
| applied | a "-10.00 EUR" discount line under the subtotal and a "Remove" link (AC-0001) |
| invalid | inline error under the input: "This coupon has expired"; total unchanged (AC-0002) |
