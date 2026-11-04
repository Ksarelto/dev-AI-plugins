# Prices in the order currency (FEAT-001)
The API formats order amounts with their ISO code and the web app shows the currency symbol.

## Acceptance criteria
- AC-0001 — formatMoney(1234, "EUR") returns "12.34 EUR"
- AC-0002 — formatPrice(12.34, "EUR") returns "€12.34"
- AC-0003 — JPY has no decimals: formatMoney(1234, "JPY") returns "1234 JPY" and formatPrice(1234, "JPY") returns "¥1,234"

## Where
- API: `api/src/lib/money.ts` — `formatMoney(amountMinor, currency)`
- Web: `web/src/entities/order/model/format-price.ts` — `formatPrice(amount, currency)`
