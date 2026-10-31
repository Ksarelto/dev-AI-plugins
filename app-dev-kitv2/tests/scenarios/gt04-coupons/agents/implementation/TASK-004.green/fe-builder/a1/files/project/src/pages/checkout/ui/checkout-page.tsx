import { useState } from "react";
import { calculateTotal } from "@/entities/order";
import { CouponField, type ApplyResult } from "@/features/apply-coupon";

const LINES = [60, 40];
const SHIPPING = 5;
const noCoupons = async (): Promise<ApplyResult> => ({ ok: false, message: "Coupons are not available" });

export function CheckoutPage({ isGuest = true, applyCoupon = noCoupons }: { isGuest?: boolean; applyCoupon?: (code: string) => Promise<ApplyResult> } = {}) {
  const [discount, setDiscount] = useState(0);
  const onApply = async (code: string) => {
    const result = await applyCoupon(code);
    setDiscount(result.ok ? result.discount : 0);
    return result;
  };
  return (
    <main>
      <h1>Checkout</h1>
      <CouponField isGuest={isGuest} onApply={onApply} />
      <p data-testid="total">Total: {calculateTotal(LINES, SHIPPING, discount).toFixed(2)} EUR</p>
    </main>
  );
}
