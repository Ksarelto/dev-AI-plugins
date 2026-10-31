# Prices in the order currency

Today every amount in the API and the web app is printed as a bare number without a currency.

The API must format order amounts with their ISO currency code, for example 12.34 EUR, so that support tools can show them as they are.

The web app must show prices with the currency symbol of the order, for example €12.34.

We sell in the euro area, the United States and Japan; the currency of an order never changes after checkout, and refunds use the currency of the original order.

Our accountants remind everyone that amounts in Japanese yen (JPY) are shown without decimals, everywhere a customer or a support agent can see them.

Rounding of stored amounts is out of scope; amounts are stored in minor units and that does not change.

Marketing would like localised number formats later; for now English formatting is fine.
