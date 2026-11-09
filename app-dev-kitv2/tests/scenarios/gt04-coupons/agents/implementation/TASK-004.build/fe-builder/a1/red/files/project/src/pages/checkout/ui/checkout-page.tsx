import { calculateTotal } from "@/entities/order";
import type { ApplyResult } from "@/features/apply-coupon";

const LINES = [60, 40];
const SHIPPING = 5;

export function CheckoutPage(_props: { isGuest?: boolean; applyCoupon?: (code: string) => Promise<ApplyResult> } = {}) {
  return (
    <main>
      <h1>Checkout</h1>
      <p data-testid="total">Total: {calculateTotal(LINES, SHIPPING).toFixed(2)} EUR</p>
    </main>
  );
}
