import { calculateTotal } from "@/entities/order";

const LINES = [60, 40];
const SHIPPING = 5;

export function CheckoutPage() {
  return (
    <main>
      <h1>Checkout</h1>
      <p data-testid="total">Total: {calculateTotal(LINES, SHIPPING).toFixed(2)} EUR</p>
    </main>
  );
}
