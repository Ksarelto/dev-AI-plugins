import { calculateTotal } from "./total";

test("the discount is subtracted before shipping (AC-0003)", () => {
  expect(calculateTotal([60, 40], 5, 10)).toBe(95);
});

test("a discount reduces a cart without shipping", () => {
  expect(calculateTotal([100], 0, 25)).toBe(75);
});
