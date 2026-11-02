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
    reuse_considered: [shared/ui/input]
    reuse_rejected: "no coupon input exists; CouponField composes shared/ui/input"
decisions: [ADR-001]
contract_ops: [applyCoupon]
---

CouponField is hidden for guests (HD-2); the loyalty rule (HD-1) is enforced by applyCoupon.
