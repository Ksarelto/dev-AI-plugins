---
feature: FEAT-001
components:
  - name: calculateTotal
    path: src/entities/order/model/total.ts
    layer: entities
    stories: [STORY-0002]
    reuse: extend
    reuse_considered: [entities/order]
  - name: CouponField
    path: src/features/apply-coupon/ui/coupon-field.tsx
    layer: features
    stories: [STORY-0001]
    reuse: new
    reuse_considered: [shared/ui/input, shared/ui/inline-error]
    reuse_rejected: "no coupon-specific input exists; the new field composes shared/ui/input and inline-error"
decisions: [ADR-001]
contract_ops: [applyCoupon]
---

# Component map — FEAT-001 coupons at checkout

Worked example (validated by `factory/schemas/component-map.schema.json`). The front matter is the
contract; the body explains how the parts fit.

- `CouponField` lives in `features/apply-coupon` and calls `applyCoupon` through a mutation hook.
- The discount enters the order total in `entities/order` (extended, not forked) — see ADR-001.
