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
      - { id: AC-0001, text: '"Reorder" on a past order adds every line to the cart with the same quantities' }
  - id: REQ-0002
    text: A customer can apply one coupon code per order
    sources: [HD-1]
    priority: should
    acs:
      - { id: AC-0002, text: 'Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line' }
open_questions: []
backlog:
  - { title: Reorder from order history, requirements: [REQ-0001] }
  - { title: Coupons at checkout, requirements: [REQ-0002], depends_on: [Reorder from order history] }
---

Greenfield PRD from the guided interview (HD-1).
