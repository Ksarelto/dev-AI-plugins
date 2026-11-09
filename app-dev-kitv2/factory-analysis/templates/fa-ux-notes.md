# UX notes — FEAT-001 coupons at checkout

Worked example. One section per surface named in `stories.yaml` (`ux.surfaces`), covering every state.
A surface is a screen; its kebab-case name (`checkout-summary`) is the screen id.

## CheckoutSummary — coupon field (STORY-0001)
| State | What the user sees |
|---|---|
| empty | "Coupon code" input and an "Apply" button, disabled until text is entered |
| loading | button shows a spinner; input is read-only |
| applied | a "-10.00 EUR" discount line under the subtotal and a "Remove" link (AC-0001) |
| invalid | inline error under the input: "This coupon has expired"; total unchanged (AC-0002) |

- Copy: "Coupon code", "Apply", "Remove", "This coupon has expired".
- Error: the typed code stays in the input so the customer can correct it; no retry banner.
- Responsive: below 640 px the input and button stack, the button full width.
- Accessibility: the input has a visible label; the error is linked to the input and announced
  politely; after "Apply" focus stays on the input; the discount line is not shown by colour alone.
- Existing parts: the order summary panel of `checkout` (capability map) is extended, not replaced.
