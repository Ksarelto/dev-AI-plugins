import { calculateTotal } from "./total";

test("the total is the sum of the lines plus shipping", () => {
  expect(calculateTotal([60, 40], 5)).toBe(105);
});

test("totals round half-even to 2 decimals", () => {
  expect(calculateTotal([0.125], 0)).toBe(0.12);
  expect(calculateTotal([0.135], 0)).toBe(0.14);
});
