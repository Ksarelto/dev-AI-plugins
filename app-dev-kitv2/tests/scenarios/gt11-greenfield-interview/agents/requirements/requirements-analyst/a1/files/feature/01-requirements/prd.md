---
feature: FEAT-001
kind: prd
summary: B2B ordering portal — reorder first, coupons second
requirements:
  - id: REQ-0001
    text: A signed-in customer can reorder any line from a past order
    sources: [HD-1]
    priority: must
    acs:
      - { id: AC-0001, kind: happy, text: '"Reorder" on a past order adds every line to the cart with the same quantities' }
      - { id: AC-0003, kind: edge, text: 'A line whose part is discontinued is skipped and the cart shows "1 item could not be added"' }
  - id: REQ-0002
    text: A customer can apply one coupon code per order
    sources: [HD-1]
    priority: should
    acs:
      - { id: AC-0002, kind: happy, text: 'Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line' }
non_functional:
  - { id: NFR-1, category: performance, text: "Reorder adds up to 50 lines to the cart in under 1 s at the 95th percentile", sources: [HD-1] }
  - { id: NFR-2, category: accessibility, text: "Every screen meets WCAG 2.2 AA and works with the keyboard only" }
  - { id: NFR-3, category: security, text: "A customer can read and reorder only their own orders; another customer's order answers 404" }
open_questions: []
backlog:
  - { title: Reorder from order history, requirements: [REQ-0001] }
  - { title: Coupons at checkout, requirements: [REQ-0002], depends_on: [Reorder from order history] }
---

Greenfield PRD from the guided interview (HD-1).
