export type Currency = 'EUR' | 'USD' | 'JPY';

/** Digits shown after the decimal point; JPY has none (SRC-005, HD-1). */
const DECIMALS: Record<Currency, number> = { EUR: 2, USD: 2, JPY: 0 };

/** Formats an amount stored in minor units with its ISO code, e.g. 1234 EUR → "12.34 EUR". */
export function formatMoney(amountMinor: number, currency: Currency): string {
  const decimals = DECIMALS[currency];
  return `${(amountMinor / 10 ** decimals).toFixed(decimals)} ${currency}`;
}
