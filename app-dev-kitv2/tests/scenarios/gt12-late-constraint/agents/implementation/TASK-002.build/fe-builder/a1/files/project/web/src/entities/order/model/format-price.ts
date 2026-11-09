export type Currency = "EUR" | "USD" | "JPY";

/** A price with the order currency's symbol; JPY never shows decimals (AC-0003). */
export function formatPrice(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    ...(currency === "JPY" ? { maximumFractionDigits: 0 } : {}),
  }).format(amount);
}
