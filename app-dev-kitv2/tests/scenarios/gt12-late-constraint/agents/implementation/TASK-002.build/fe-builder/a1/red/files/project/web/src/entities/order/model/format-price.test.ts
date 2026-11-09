import { formatPrice } from "./format-price";

test("AC-0002 shows EUR with the euro sign", () => {
  expect(formatPrice(12.34, "EUR")).toBe("€12.34");
});

test("AC-0003 shows JPY without decimals", () => {
  expect(formatPrice(1234, "JPY")).toBe("¥1,234");
});
