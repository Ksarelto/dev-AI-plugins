---
feature: FEAT-001
kind: prd
summary: Self-service B2B ordering portal where customers reorder spare parts and apply negotiated coupons
requirements:
  - id: REQ-0001
    text: A signed-in customer can reorder any line from a past order in two clicks
    sources: [SRC-001]
    priority: must
    acs:
      - { id: AC-0001, kind: happy, text: 'From an order in "My orders", "Reorder" adds every line to the cart with the same quantities' }
      - { id: AC-0002, kind: edge, text: 'A line whose part is discontinued is skipped and listed in a message "1 item could not be added"' }
  - id: REQ-0002
    text: A customer can apply one coupon code per order at checkout
    sources: [SRC-002, HD-1]
    priority: should
    acs:
      - { id: AC-0003, kind: happy, text: 'Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line' }
non_functional:
  - { id: NFR-1, category: performance, text: "Reorder adds up to 50 lines to the cart in under 1 s at the 95th percentile", sources: [SRC-001] }
  - { id: NFR-2, category: accessibility, text: "Every screen meets WCAG 2.2 AA and works with the keyboard only" }
  - { id: NFR-3, category: security, text: "Only the signed-in customer's own orders can be read or reordered; other customers' orders return 404" }
open_questions:
  - { id: OQ-1, severity: major, text: Can guests use coupons?, default: "no", status: defaulted }
out_of_scope: [payment provider administration, mobile apps]
backlog:
  - { title: Reorder from order history, requirements: [REQ-0001] }
  - { title: Coupons at checkout, requirements: [REQ-0002], depends_on: [Reorder from order history] }
---

# Ordering portal — requirements

Worked example of a greenfield PRD. The YAML front matter is the contract (validated by
`factory/schemas/prd.schema.json`); this body is narrative only: context, personas, and anything a
reader needs to judge the requirements. Each fact has one home — refer to IDs instead of restating.

## Context
B2B customers reorder the same parts every month and currently phone the sales desk (SRC-001).

## Backlog
Two features, delivered in order: reordering first, coupons second (coupons reuse the cart).
